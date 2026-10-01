// Service Worker بسيط: يجعل الموقع قابلًا للتثبيت ويسرّع التحميل.
// لا يخزّن أي طلبات API ولا أي بيانات مستخدم — فقط ملفات الواجهة الثابتة.
// غيّر رقم الإصدار عند الحاجة لإجبار مسح الكاش القديم.
const CACHE = "tashkeel-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // طلبات الـ API والنطاقات الأخرى (الخطوط، الـ backend، تخزين الصور) تذهب للشبكة مباشرة
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api")) return;

  // التنقل بين الصفحات: الشبكة أولًا (لتصل التحديثات)، ثم النسخة المخزنة إن لم يوجد اتصال
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/").then((cached) => cached || Response.error()))
    );
    return;
  }

  // ملفات الواجهة الثابتة (JS/CSS/صور): من الكاش فورًا مع تحديثها في الخلفية
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
