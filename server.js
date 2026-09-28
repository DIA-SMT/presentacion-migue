// Servidor local de la presentación de Migue. Sin dependencias.
//
//   node server.js            → http://localhost:8080  (presentación)
//                               http://<IP-de-la-compu>:8080/control.html  (control remoto)
//
// El control remoto manda comandos por POST /cmd; la presentación los recibe
// por GET /events (Server-Sent Events). Todo por la red local: no hace falta internet.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = parseInt(process.env.PORT, 10) || 8080;
const ROOT = __dirname;
const TIPOS = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
};

const oyentes = new Set();   // pantallas de presentación conectadas
let ultimoEstado = null;     // lo que la presentación reporta (placa actual, Migue sonando o no)
let ultimoControl = 0;       // última vez que el celular preguntó el estado

function servirArchivo(req, res) {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (rel === '/') rel = '/index.html';
    // Direcciones sin ".html", como en Vercel: /control → control.html
    if (!path.extname(rel) && fs.existsSync(path.join(ROOT, rel + '.html'))) rel += '.html';
    const archivo = path.normalize(path.join(ROOT, rel));
    if (!archivo.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.stat(archivo, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); return res.end('No encontrado'); }
        const tipo = TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream';
        // Rangos: el navegador los pide para poder adelantar/rebobinar los videos.
        const rango = req.headers.range;
        if (rango) {
            const [a, b] = rango.replace('bytes=', '').split('-');
            const ini = parseInt(a, 10), fin = b ? parseInt(b, 10) : st.size - 1;
            res.writeHead(206, { 'Content-Type': tipo, 'Content-Range': `bytes ${ini}-${fin}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': fin - ini + 1 });
            return fs.createReadStream(archivo, { start: ini, end: fin }).pipe(res);
        }
        res.writeHead(200, { 'Content-Type': tipo, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
        fs.createReadStream(archivo).pipe(res);
    });
}

function leerCuerpo(req) {
    return new Promise(ok => { let d = ''; req.on('data', c => { d += c; if (d.length > 1e4) req.destroy(); }); req.on('end', () => ok(d)); });
}

http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write('retry: 1000\n\n');
        oyentes.add(res);
        const latido = setInterval(() => res.write(': ok\n\n'), 15000);
        req.on('close', () => { clearInterval(latido); oyentes.delete(res); });
        return;
    }
    if (url.pathname === '/cmd' && req.method === 'POST') {
        let cmd;
        try { cmd = JSON.parse(await leerCuerpo(req)); } catch { res.writeHead(400); return res.end(); }
        for (const o of oyentes) o.write(`data: ${JSON.stringify(cmd)}\n\n`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, pantallas: oyentes.size }));
    }
    // Pregunta en vivo: se reenvía al chat web real de Migue (ver api/preguntar.js).
    if (url.pathname === '/api/preguntar' && req.method === 'POST') {
        let body = {};
        try { body = JSON.parse(await leerCuerpo(req)); } catch { }
        const mensaje = String(body.mensaje || '').trim().slice(0, 400);
        const sessionId = String(body.sessionId || 'presentacion').slice(0, 80);
        res.setHeader('Content-Type', 'application/json');
        if (!mensaje) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Falta la pregunta' })); }
        try {
            const r = await fetch('https://migue.smt.gob.ar/api/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mensaje, sessionId }), signal: AbortSignal.timeout(55000),
            });
            const j = await r.json().catch(() => ({}));
            res.writeHead(r.status); return res.end(JSON.stringify({ respuesta: j.respuesta || null, error: j.error || null }));
        } catch (e) {
            res.writeHead(502); return res.end(JSON.stringify({ error: 'Migue no respondió a tiempo' }));
        }
    }
    // La pantalla pregunta su IP en la red (para el QR del celular) y si hay un celular conectado.
    if (url.pathname === '/red') {
        const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
        return res.end(JSON.stringify({ ips, controlHace: ultimoControl ? Date.now() - ultimoControl : 1e9 }));
    }
    if (url.pathname === '/estado') {
        if (req.method === 'POST') { try { ultimoEstado = JSON.parse(await leerCuerpo(req)); } catch { } res.writeHead(204); return res.end(); }
        ultimoControl = Date.now();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
        return res.end(JSON.stringify({ ...(ultimoEstado || {}), pantallas: oyentes.size }));
    }
    servirArchivo(req, res);
}).listen(PORT, '0.0.0.0', () => {
    const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
    console.log(`\nPresentación:   http://localhost:${PORT}`);
    ips.forEach(ip => console.log(`Control remoto: http://${ip}:${PORT}/control.html`));
    console.log('');
});
