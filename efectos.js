// =====================================================================
// Recursos en vivo de la presentación. Cada uno se dispara con un comando
// (desde el celular o el teclado) y no depende de la placa en la que estés.
//   · vivo.preguntar(texto)  Migue contesta en la pantalla grande, de verdad.
//   · efectos.azahar(on)     lluvia de pétalos con los colores de la marca: se prende y se para a mano.
//   · efectos.foco(on)       apaga la placa e ilumina a Migue.
//   · efectos.qr(on)         QR gigantes para que la sala le escriba.
//   · efectos.negro(on)      pantalla negra.
//   · efectos.barrido(fn)    transición de pétalos; fn cambia la placa a mitad.
// =====================================================================
(function () {
  const stage = document.getElementById('stage');

  // ---------------------------------------------------------------- azahar
  // Llueve mientras está prendido y se apaga con un fundido corto: nunca queda
  // lloviendo sola. Tope de pétalos en pantalla para no cargar la compu, y un
  // apagado de seguridad si nadie la apaga.
  const lienzo = document.getElementById('azahar');
  const cx = lienzo.getContext('2d');
  const COLORES = ['#0066ff', '#2eb1ff', '#ffffff', '#2eb1ff', '#0066ff'];
  const MAX = 170, POR_SEGUNDO = 38, SEGURIDAD = 120000; // se apaga sola a los 2 minutos si nadie la para
  let petalos = [], lloviendo = false, corriendo = false, apagado = 1, ultimo = 0, acumulado = 0, tope = null;
  function nuevoPetalo() {
    return {
      x: Math.random() * 1920, y: -40 - Math.random() * 80, s: 14 + Math.random() * 22,
      vy: 110 + Math.random() * 150, vx: -40 + Math.random() * 80, fase: Math.random() * 6.28,
      rot: Math.random() * 6.28, vr: -1.8 + Math.random() * 3.6,
      color: Math.random() < 0.16 ? '#f4dc00' : COLORES[Math.floor(Math.random() * COLORES.length)],
      punto: Math.random() < 0.16,
    };
  }
  function dibujarPetalo(p) {
    cx.setTransform(Math.cos(p.rot), Math.sin(p.rot), -Math.sin(p.rot), Math.cos(p.rot), p.x, p.y);
    cx.fillStyle = p.color;
    if (p.punto) { cx.beginPath(); cx.arc(0, 0, p.s * 0.45, 0, 7); cx.fill(); }
    else { const s = p.s; cx.beginPath(); cx.moveTo(0, -s); cx.quadraticCurveTo(s * 0.9, 0, 0, s); cx.quadraticCurveTo(-s * 0.9, 0, 0, -s); cx.fill(); }
  }
  function cuadroAzahar(t) {
    const dt = Math.min(0.05, ultimo ? (t - ultimo) / 1000 : 0.016); ultimo = t;
    if (lloviendo) {
      acumulado += dt * POR_SEGUNDO;
      while (acumulado >= 1) { acumulado--; if (petalos.length < MAX) petalos.push(nuevoPetalo()); }
    } else apagado = Math.max(0, apagado - dt / 1.2);
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, 1920, 1080);
    cx.globalAlpha = apagado;
    petalos.forEach(p => { p.fase += dt * 2; p.x += (p.vx + Math.sin(p.fase) * 60) * dt; p.y += p.vy * dt; p.rot += p.vr * dt; dibujarPetalo(p); });
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalAlpha = 1;
    petalos = petalos.filter(p => p.y < 1140);
    if (lloviendo || (apagado > 0 && petalos.length)) requestAnimationFrame(cuadroAzahar);
    else { corriendo = false; petalos = []; cx.clearRect(0, 0, 1920, 1080); }
  }
  function azahar(on) {
    lloviendo = on == null ? !lloviendo : !!on;
    clearTimeout(tope);
    if (lloviendo) {
      apagado = 1;
      tope = setTimeout(() => azahar(false), SEGURIDAD);
      if (!corriendo) { corriendo = true; ultimo = 0; requestAnimationFrame(cuadroAzahar); }
    }
    avisarCambio();
  }
  function avisarCambio() { window.informar && window.informar(); }

  // ---------------------------------------------------------------- foco, qr, negro
  let focoManual = false, focoAuto = true;
  function aplicarFoco() {
    const hablando = !!(window.migueHablando && window.migueHablando());
    stage.classList.toggle('foco', focoManual || (focoAuto && hablando));
  }
  setInterval(aplicarFoco, 150);
  const qrs = document.getElementById('qrs'), negro = document.getElementById('negro');

  // ---------------------------------------------------------------- barrido
  const barridoEl = document.getElementById('barrido');
  function barrido(cambiar) {
    barridoEl.classList.remove('va'); void barridoEl.offsetWidth; barridoEl.classList.add('va');
    setTimeout(cambiar, 470);
    setTimeout(() => barridoEl.classList.remove('va'), 1250);
  }

  window.efectos = {
    azahar,
    foco: (on) => { focoManual = on == null ? !focoManual : !!on; aplicarFoco(); },
    focoAuto: (on) => { focoAuto = on == null ? !focoAuto : !!on; aplicarFoco(); },
    qr: (on) => qrs.classList.toggle('ver', on == null ? !qrs.classList.contains('ver') : !!on),
    negro: (on) => negro.classList.toggle('ver', on == null ? !negro.classList.contains('ver') : !!on),
    barrido,
    estado: () => ({ foco: focoManual, focoAuto, azahar: lloviendo, qr: qrs.classList.contains('ver'), negro: negro.classList.contains('ver') }),
  };

  // ---------------------------------------------------------------- en vivo
  // La pregunta viaja a /api/preguntar, que la reenvía al chat web real de
  // Migue (el mismo del sitio smt.gob.ar). La respuesta queda registrada en
  // el panel como cualquier otra consulta.
  const vivoEl = document.getElementById('vivo'), hilo = vivoEl.querySelector('.hilo');
  const sesion = 'presentacion-' + Date.now().toString(36);
  let estadoVivo = null, tipeo = null;
  function escapar(t) { return t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function formatear(t) {
    return escapar(t.trim())
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<b>$1</b>')
      .replace(/^\s*[-•]\s+/gm, '• ').replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
  }
  // Escribe el HTML de a poco, sin partir las etiquetas.
  function tipear(el, html, alTerminar) {
    const partes = html.split(/(<[^>]+>)/).filter(Boolean);
    let i = 0, j = 0, hecho = '';
    clearInterval(tipeo);
    tipeo = setInterval(() => {
      let n = 3;
      while (n-- > 0 && i < partes.length) {
        const p = partes[i];
        if (p.startsWith('<')) { hecho += p; i++; continue; }
        hecho += p[j++]; if (j >= p.length) { i++; j = 0; }
      }
      el.innerHTML = hecho; hilo.scrollTop = hilo.scrollHeight;
      if (i >= partes.length) { clearInterval(tipeo); alTerminar && alTerminar(); }
    }, 22);
  }
  async function preguntar(texto) {
    texto = String(texto || '').trim().slice(0, 400);
    if (!texto) return;
    clearInterval(tipeo);
    vivoEl.classList.add('ver'); stage.classList.add('envivo');
    hilo.innerHTML = `<div class="preg">${escapar(texto)}</div><div class="resp"><img src="img/migue-cara.png" alt=""><div class="txt"><div class="pensando"><i></i><i></i><i></i></div></div></div>`;
    const txt = hilo.querySelector('.resp .txt');
    estadoVivo = 'pensando'; avisar();
    try {
      const sala = (window.Remoto && window.Remoto.sala) || '';
      const ctrl = new AbortController(); const corte = setTimeout(() => ctrl.abort(), 60000);
      const r = await fetch('api/preguntar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sala': sala }, body: JSON.stringify({ mensaje: texto, sessionId: sesion }), signal: ctrl.signal });
      clearTimeout(corte);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.respuesta) throw new Error(j.error || ('HTTP ' + r.status));
      if (j.respuesta.length > 420) txt.classList.add('chica');
      estadoVivo = 'respondiendo'; avisar();
      tipear(txt, formatear(j.respuesta), () => { estadoVivo = 'respondida'; avisar(); });
    } catch (e) {
      txt.innerHTML = `<span class="error">No pude conectarme con Migue en este momento.</span>`;
      estadoVivo = 'error'; avisar(); console.warn('preguntar:', e);
    }
  }
  function cerrar() { clearInterval(tipeo); vivoEl.classList.remove('ver'); stage.classList.remove('envivo'); estadoVivo = null; avisar(); }
  function avisar() { window.informar && window.informar(); }
  window.vivo = { preguntar, cerrar, estado: () => estadoVivo };
})();
