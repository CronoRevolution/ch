/* Service worker de la app de comisarios (CH) — v3.3
   PRIMERO LA RED, después la copia guardada.
   - Con cobertura: siempre la versión publicada (y se guarda copia).
   - Sin cobertura, o si la red tarda más de ESPERA_MS: la última copia
     guardada. Así la app abre en un CH sin señal.
   - Solo toca ficheros de la propia app (mismo origen, GET). Firebase
     (websocket y googleapis) pasa por fuera, sin tocar.
   La cola de fichajes NO vive aquí: está en localStorage y la sube la app.   */
const CACHE = 'chapp-3.7';
const ESPERA_MS = 4000;
const FICHEROS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png',
  './lib/firebase-app-compat.js', './lib/firebase-database-compat.js', './lib/firebase-auth-compat.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(FICHEROS.map(f =>
      fetch(f, { cache: 'no-store' }).then(r => { if (r.ok) return c.put(f, r); }).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('chapp-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // La página se guarda siempre como './' para encontrarla con o sin ?…
    const clave = req.mode === 'navigate' ? './' : req;
    const red = fetch(req, { cache: 'no-store' }).then(r => {
      if (r && r.ok) cache.put(clave, r.clone()).catch(() => {});
      return r;
    });
    const guardada = () => cache.match(clave, { ignoreSearch: true });
    try {
      const r = await Promise.race([
        red,
        new Promise((_, no) => setTimeout(() => no(new Error('lenta')), ESPERA_MS)),
      ]);
      return r;
    } catch (err) {
      const g = await guardada();
      if (g) return g;
      return red;   // nada guardado: esperar a la red, aunque tarde
    }
  })());
});
