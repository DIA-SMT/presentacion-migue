// Comunicación entre la presentación y el control remoto del celular.
//
// Dos caminos, según dónde corra:
//   · "supabase": publicada en internet (Vercel). Los dos se hablan por un canal
//     en tiempo real de Supabase (broadcast). No toca ninguna tabla.
//   · "local": en la compu, con server.js. Comandos por POST /cmd y SSE /events.
//
// El canal se identifica con el código de sala (config.js o ?sala= en la URL):
// quien no lo conoce no puede manejar la presentación.
(function () {
  const CFG = window.MIGUE_CONFIG || {};
  const params = new URLSearchParams(location.search);
  const sala = (params.get('sala') || CFG.sala || '').trim();
  const hayServidorLocal = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
  const haySupabase = !!(CFG.supabaseUrl && CFG.supabaseKey && sala && window.supabase);
  const modo = haySupabase ? 'supabase' : (location.protocol.startsWith('http') && hayServidorLocal ? 'local' : 'ninguno');

  function iniciar({ rol, alRecibirComando, alRecibirEstado, alCambiarConexion }) {
    const avisar = (ok, txt) => alCambiarConexion && alCambiarConexion(ok, txt);

    if (modo === 'supabase') {
      const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);
      const canal = sb.channel('migue-presentacion-' + sala, { config: { broadcast: { self: false } } });
      let ultimaPantalla = 0;
      if (rol === 'pantalla') {
        canal.on('broadcast', { event: 'cmd' }, ({ payload }) => alRecibirComando && alRecibirComando(payload));
        canal.on('broadcast', { event: 'pedir-estado' }, () => api.pedirEstado && api.pedirEstado());
      } else {
        canal.on('broadcast', { event: 'estado' }, ({ payload }) => { ultimaPantalla = Date.now(); alRecibirEstado && alRecibirEstado(payload); });
        setInterval(() => { if (Date.now() - ultimaPantalla > 7000) avisar(false, 'Sin pantalla conectada'); }, 2000);
      }
      canal.subscribe((st) => {
        if (st === 'SUBSCRIBED') {
          avisar(true, 'Conectado');
          if (rol === 'control') canal.send({ type: 'broadcast', event: 'pedir-estado', payload: {} });
        } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') avisar(false, 'Sin conexión');
      });
      const api = {
        modo, sala,
        enviarComando: (c) => canal.send({ type: 'broadcast', event: 'cmd', payload: c }),
        enviarEstado: (e) => canal.send({ type: 'broadcast', event: 'estado', payload: e }),
        pedirEstado: null,
      };
      return api;
    }

    if (modo === 'local') {
      if (rol === 'pantalla') {
        const es = new EventSource('/events');
        es.onmessage = (ev) => { try { alRecibirComando && alRecibirComando(JSON.parse(ev.data)); } catch (e) { } };
      } else {
        setInterval(async () => {
          try {
            const e = await (await fetch('/estado', { cache: 'no-store' })).json();
            avisar(e.pantallas > 0, e.pantallas > 0 ? 'Conectado' : 'Sin pantalla conectada');
            if (e.total) alRecibirEstado && alRecibirEstado(e);
          } catch (err) { avisar(false, 'Sin conexión con la compu'); }
        }, 700);
      }
      return {
        modo, sala,
        enviarComando: (c) => fetch('/cmd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) }).catch(() => { }),
        enviarEstado: (e) => fetch('/estado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e) }).catch(() => { }),
      };
    }

    avisar(false, 'Control remoto sin configurar');
    return { modo, sala, enviarComando: () => { }, enviarEstado: () => { } };
  }

  window.Remoto = { iniciar, modo, sala };
})();
