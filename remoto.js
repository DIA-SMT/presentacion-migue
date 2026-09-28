// Comunicación entre la presentación (pantalla) y el control del celular.
//
// Dos caminos, según dónde corra:
//   · "supabase": publicada en internet (Vercel). Los dos se hablan por un canal
//     en tiempo real de Supabase (broadcast). No toca ninguna tabla.
//   · "local": en la compu, con server.js. Comandos por POST /cmd y SSE /events.
//
// EL CÓDIGO DE SALA
//   Identifica el canal: quien no lo conoce no puede manejar la presentación.
//   Llega en el link (?sala=…) y queda guardado en ese navegador, así que
//   después se puede abrir la dirección sin el código. Nunca va en el repo.
//
// QUE NO SE PIERDA NINGÚN TOQUE
//   Cada comando viaja con un id. La pantalla contesta "ack" con ese id; si el
//   celular no recibe la confirmación, reintenta. La pantalla ignora los ids
//   repetidos, así que un reintento nunca ejecuta dos veces la misma orden.
//   Si el canal se cae (red, celular bloqueado), se vuelve a conectar solo.
(function () {
  const CFG = window.MIGUE_CONFIG || {};
  const CLAVE = 'migue-sala';
  const params = new URLSearchParams(location.search);
  let sala = (params.get('sala') || '').trim();
  try {
    if (sala) localStorage.setItem(CLAVE, sala);
    else sala = (localStorage.getItem(CLAVE) || CFG.sala || '').trim();
  } catch (e) { }

  const hayServidorLocal = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
  const haySupabase = !!(CFG.supabaseUrl && CFG.supabaseKey && window.supabase);
  const modo = haySupabase && sala ? 'supabase'
    : (location.protocol.startsWith('http') && hayServidorLocal ? 'local'
      : (haySupabase ? 'sin-sala' : 'ninguno'));

  function guardarSala(codigo) {
    try { localStorage.setItem(CLAVE, String(codigo || '').trim()); } catch (e) { }
    const u = new URL(location.href); u.searchParams.set('sala', String(codigo || '').trim()); location.href = u.toString();
  }

  function iniciar({ rol, alRecibirComando, alRecibirEstado, alCambiarConexion }) {
    const avisar = (ok, txt) => alCambiarConexion && alCambiarConexion(ok, txt);
    const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    // ------------------------------------------------------------ Supabase
    if (modo === 'supabase') {
      const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { realtime: { params: { eventsPerSecond: 20 } } });
      let canal = null, listo = false, reintento = null, espera = 800;
      const pendientes = new Map();      // control: id → { cmd, intentos, timer, alTerminar }
      const vistos = [];                 // pantalla: últimos ids ejecutados
      let ultimaPantalla = 0, ultimoControl = 0;

      function enviarCrudo(evento, payload) {
        if (!canal || !listo) return false;
        canal.send({ type: 'broadcast', event: evento, payload }).catch(() => { });
        return true;
      }
      function conectar() {
        clearTimeout(reintento);
        if (canal) { try { sb.removeChannel(canal); } catch (e) { } }
        listo = false;
        canal = sb.channel('migue-presentacion-' + sala, { config: { broadcast: { self: false, ack: false } } });
        if (rol === 'pantalla') {
          canal.on('broadcast', { event: 'cmd' }, ({ payload }) => {
            ultimoControl = Date.now();
            const id = payload && payload.id;
            enviarCrudo('ack', { id });
            if (id && vistos.includes(id)) return;
            if (id) { vistos.push(id); if (vistos.length > 80) vistos.shift(); }
            alRecibirComando && alRecibirComando(payload);
          });
          canal.on('broadcast', { event: 'pedir-estado' }, () => { ultimoControl = Date.now(); api.pedirEstado && api.pedirEstado(); });
        } else {
          canal.on('broadcast', { event: 'estado' }, ({ payload }) => { ultimaPantalla = Date.now(); alRecibirEstado && alRecibirEstado(payload); });
          canal.on('broadcast', { event: 'ack' }, ({ payload }) => {
            ultimaPantalla = Date.now();
            const p = payload && pendientes.get(payload.id);
            if (p) { clearTimeout(p.timer); pendientes.delete(payload.id); p.alTerminar && p.alTerminar(true); }
          });
        }
        canal.subscribe((st) => {
          if (st === 'SUBSCRIBED') {
            listo = true; espera = 800;
            if (rol === 'control') { enviarCrudo('pedir-estado', {}); avisar(false, 'Buscando la pantalla…'); }
            else { avisar(true, 'Conectado'); api.pedirEstado && api.pedirEstado(); }
          } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') {
            listo = false; avisar(false, 'Reconectando…');
            reintento = setTimeout(conectar, espera); espera = Math.min(espera * 2, 5000);
          }
        });
      }
      conectar();
      // Al volver a la pestaña (celular desbloqueado), confirmar que el canal sigue vivo.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (!listo) conectar(); else if (rol === 'control') enviarCrudo('pedir-estado', {});
      });
      addEventListener('online', () => conectar());
      if (rol === 'control') {
        setInterval(() => {
          const viva = Date.now() - ultimaPantalla < 6500;
          if (listo) avisar(viva, viva ? 'Conectado' : 'Sin pantalla: ¿está abierta con el mismo código?');
          if (listo && !viva) enviarCrudo('pedir-estado', {});
        }, 1500);
      }
      const api = {
        modo, sala, guardarSala,
        // alTerminar(ok): true cuando la pantalla confirmó; false si no llegó tras reintentar.
        enviarComando: (c, alTerminar) => {
          const id = nuevoId(), cmd = { ...c, id };
          const p = { intentos: 0, alTerminar };
          const mandar = () => {
            p.intentos++;
            enviarCrudo('cmd', cmd);
            p.timer = setTimeout(() => {
              if (!pendientes.has(id)) return;
              if (p.intentos < 4) mandar();
              else { pendientes.delete(id); alTerminar && alTerminar(false); }
            }, 900);
          };
          pendientes.set(id, p); mandar();
        },
        enviarEstado: (e) => enviarCrudo('estado', e),
        pedirEstado: null,
        // Pantalla: ¿hay un celular conectado a esta sala?
        controlVivo: async () => Date.now() - ultimoControl < 8000,
        linkControl: async () => location.origin + '/control?sala=' + encodeURIComponent(sala),
      };
      return api;
    }

    // ------------------------------------------------------------ local (server.js)
    if (modo === 'local') {
      if (rol === 'pantalla') {
        const es = new EventSource('/events');
        const vistos = [];
        es.onopen = () => avisar(true, 'Conectado');
        es.onerror = () => avisar(false, 'Reconectando…');
        es.onmessage = (ev) => {
          try {
            const c = JSON.parse(ev.data);
            if (c.id && vistos.includes(c.id)) return;
            if (c.id) { vistos.push(c.id); if (vistos.length > 80) vistos.shift(); }
            alRecibirComando && alRecibirComando(c);
          } catch (e) { }
        };
      } else {
        const sondear = async () => {
          try {
            const e = await (await fetch('/estado', { cache: 'no-store' })).json();
            avisar(e.pantallas > 0, e.pantallas > 0 ? 'Conectado' : 'Sin pantalla: ¿está abierta la presentación?');
            if (e.total) alRecibirEstado && alRecibirEstado(e);
          } catch (err) { avisar(false, 'Sin conexión con la compu'); }
        };
        setInterval(sondear, 700); sondear();
      }
      return {
        modo, sala, guardarSala,
        enviarComando: (c, alTerminar) => {
          const cmd = { ...c, id: nuevoId() };
          let intentos = 0;
          const mandar = () => fetch('/cmd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) })
            .then(r => r.json()).then(j => alTerminar && alTerminar(j.pantallas > 0))
            .catch(() => { if (++intentos < 3) setTimeout(mandar, 400); else alTerminar && alTerminar(false); });
          mandar();
        },
        enviarEstado: (e) => fetch('/estado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e) }).catch(() => { }),
        // En local el celular entra por la IP de la compu en la red, no por localhost.
        controlVivo: async () => { try { const j = await (await fetch('/red', { cache: 'no-store' })).json(); return j.controlHace < 5000; } catch (e) { return false; } },
        linkControl: async () => { try { const j = await (await fetch('/red', { cache: 'no-store' })).json(); if (j.ips && j.ips[0]) return 'http://' + j.ips[0] + ':' + location.port + '/control'; } catch (e) { } return location.origin + '/control'; },
      };
    }

    // ------------------------------------------------------------ sin configurar
    avisar(false, modo === 'sin-sala' ? 'Falta el código de sala' : 'Control remoto sin configurar');
    return { modo, sala, guardarSala, enviarComando: (c, alTerminar) => alTerminar && alTerminar(false), enviarEstado: () => { }, controlVivo: async () => false, linkControl: async () => null };
  }

  window.Remoto = { iniciar, modo, sala, guardarSala };
})();
