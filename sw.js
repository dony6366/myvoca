// 오프라인에서도 열리도록 앱 파일을 캐시해 두는 서비스 워커
const CACHE = "myvoca-v8";
const FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./words.js",
  "./grammar.js",
  "./phrases.js",
  "./leveltest.js",
  "./shadowing.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  // 이전 버전 캐시 정리
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
