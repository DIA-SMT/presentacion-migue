// Configuración del control remoto cuando la presentación está publicada (Vercel).
// Completar con la URL y la clave pública (anon) de un proyecto de Supabase con
// Realtime habilitado. La clave anon es pública por diseño; lo que protege el
// canal es el código de sala, que va SOLO en el link (?sala=…), nunca acá:
// este archivo lo puede leer cualquiera que entre al sitio.
// Sin estos datos la presentación funciona igual, pero sin control remoto.
window.MIGUE_CONFIG = {
  supabaseUrl: 'https://sdnbrlobzqfzurfpoxam.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkbmJybG9ienFmenVyZnBveGFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MTMzNzAsImV4cCI6MjEwNjE4OTM3MH0.oin_JWb1_obOMFtXl-ToZRJN449fVVN3BgaFiebCfAk',
};
