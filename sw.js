const CACHE_NAME = 'score-cekih-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/images/background.png',
  '/images/joker.png',
  '/images/joker.ico',
  '/images/card_1.png',
  '/images/card_2.png',
  '/images/card_3.png',
  '/images/card_4.png',
  '/audio/casino_bg.mp3',
  '/audio/mulai_dari_0_ya_bapak.wav',
  '/audio/kok_minus_terus_sih_gamau_menang.wav',
  '/audio/klik.wav',
  '/video/border_1.webm',
  '/video/border_2.webm',
  '/video/border_3.webm',
  '/video/border_4.webm',
  '/video/dragon.mp4',
  '/video/tiger.mp4',
  '/video/eagle.mp4',
  '/video/qilin.mp4'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        ASSETS.map(url => cache.add(url).catch(err => console.warn('SW cache miss:', url, err)))
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
