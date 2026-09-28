# Presentación de Migue

Presentación del lanzamiento de Migue, el asistente virtual de la Municipalidad de San Miguel de Tucumán. Migue aparece al costado de las placas, recortado del fondo verde en tiempo real, y habla cuando el expositor lo activa.

- **Publicada:** https://migue-presentacion.vercel.app
- **Sin internet:** doble clic en `INICIAR.bat` (necesita Node.js). Abierta como archivo (`file:///…`) Migue no se ve: el navegador no deja recortar el video.

## Uso

| Acción | Teclado / clicker |
|---|---|
| Placa siguiente / anterior | → ← · AvPág RePág · Espacio |
| Migue dice el próximo video | Enter · M · B · . |
| Migue dice un video puntual | 1 … 9 |
| Callar · repetir · volver al video 1 | S · R · 0 |
| Ocultar a Migue · pantalla completa · ayuda | H · F · ? |
| Abrir el panel de Migue en otra pestaña | D |

**Control remoto (celular):** la pantalla y el celular se abren con el mismo código de sala en el link:

- Pantalla: `https://migue-presentacion.vercel.app/?sala=CODIGO`
- Celular: `https://migue-presentacion.vercel.app/control?sala=CODIGO`

Publicada, se comunican por un canal en tiempo real de Supabase (`remoto.js`, `config.js`). En local, por `server.js`. El código de sala va solo en el link, nunca en el repo.

## Archivos

- `index.html` — placas, Migue (recorte WebGL) y escenas animadas. La lista `VIDEOS` define el orden y el nombre de cada video.
- `control.html` — control remoto con las notas de cada placa.
- `media/` — videos de Migue sobre verde (`migue*.mp4`) y loops de espera (`migueloop*.mp4`).
- `server.js` — servidor local para usarla sin internet.

## Publicar cambios

```bash
npx.cmd vercel deploy --prod
```
