const CACHE_NAME = 'lumin-vip-v8';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=Inter:wght@300;400;500;600&display=swap',
  // Se agregan los workers y librerías clave
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'
];

// Instalación del SW: Pre-cachear assets estáticos vitales
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Lumin SW] Precaching app shell');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activación del SW: Limpiar caches viejas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[Lumin SW] Removiendo cache antigua', key);
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

// Estrategia Network First con fallback a Cache para la navegación, y Cache First para CDNs
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // No interceptar peticiones a la API de Google Apps Script (POST)
  if (url.origin === 'https://script.google.com') {
    return;
  }

  // Archivos del CDN (Fuentes, fontawesome, pdf.js): Cache First, fallback Network
  if (url.origin === 'https://cdnjs.cloudflare.com' || 
      url.origin === 'https://fonts.googleapis.com' ||
      url.origin === 'https://fonts.gstatic.com' ||
      url.origin === 'https://cdn.jsdelivr.net') {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // HTML y otros assets locales: Network First, fallback Cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Guardar la versión más reciente en cache
        const resClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, resClone);
        });
        return response;
      })
      .catch(() => {
        // Offline: Buscar en cache
        return caches.match(event.request)
          .then((response) => {
            if (response) return response;
            // Si piden algo que no está en cache, devolver index.html como salvavidas SPA
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
          });
      })
  );
});
