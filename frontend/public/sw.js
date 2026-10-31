// Service Worker: يجعل الموقع قابلًا للتثبيت ويسرّع التحميل، ويستقبل إشعارات Web Push حتى والموقع مغلق.
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

// ───────────────────────── Web Push ─────────────────────────
// لا علاقة لهذا القسم بالكاش أعلاه. الرسالة JSON من الخادم:
// { title, body, url (مثل /#/daily-tasks?date=...&nid=...), tag, type, notificationId, timer }

const APP_ORIGIN = self.location.origin;
const FALLBACK_URL = "/#/notifications";

// رابط آمن: نفس نطاق الموقع فقط (لا نفتح أي نطاق آخر مهما كانت الرسالة)
function safeTarget(raw) {
  try {
    const url = new URL(raw || FALLBACK_URL, APP_ORIGIN);
    return url.origin === APP_ORIGIN ? url.href : new URL(FALLBACK_URL, APP_ORIGIN).href;
  } catch {
    return new URL(FALLBACK_URL, APP_ORIGIN).href;
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "تشكيل";
  const timer = data.timer === true;
  const expired = data.type === "TIMER_EXPIRED";
  const tag = typeof data.tag === "string" && data.tag ? data.tag : undefined;

  const options = {
    body: typeof data.body === "string" ? data.body : "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    lang: "ar",
    dir: "rtl",
    data: { url: safeTarget(data.url), type: data.type || "", notificationId: data.notificationId || "" },
    vibrate: timer ? [300, 150, 300, 150, 600] : [200, 100, 200],
    // انتهاء الوقت يبقى على الشاشة حتى يتفاعل المستخدم (لا يختفي وحده)
    requireInteraction: expired,
  };
  // الإشعار بنفس الـ tag يحلّ محل السابق؛ renotify يعيد الصوت/الاهتزاز (وهو يرمي خطأ بدون tag)
  if (tag) {
    options.tag = tag;
    options.renotify = true;
  }

  event.waitUntil(
    (async () => {
      // نُظهر الإشعار دائماً (iOS وChrome يشترطان ذلك وإلا أُلغي الاشتراك)
      await self.registration.showNotification(title, options);
      // وإن كان الموقع مفتوحاً نُبلغه ليشغّل صوت الإنذار داخل الصفحة
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const win of wins) win.postMessage({ type: "push-received", payload: data });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = safeTarget(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const win = wins.find((c) => {
        try {
          return new URL(c.url).origin === APP_ORIGIN;
        } catch {
          return false;
        }
      });
      if (win) {
        try {
          await win.focus();
        } catch {
          // التركيز قد يُرفض في بعض المتصفحات؛ نكمل بالتنقل
        }
        // الصفحة المفتوحة تنتقل بنفسها (HashRouter) دون إعادة تحميل
        win.postMessage({ type: "notification-click", url: target });
        return;
      }
      await self.clients.openWindow(target);
    })()
  );
});

// المتصفح قد يدوّر الاشتراك (انتهاء/تغيير مفاتيح). نعيد الاشتراك بنفس المفتاح العام؛
// وعند أول فتح للتطبيق تزامنه الواجهة مع الخادم (الـ Service Worker لا يملك توكن الدخول).
self.addEventListener("pushsubscriptionchange", (event) => {
  const old = event.oldSubscription;
  const key = old && old.options && old.options.applicationServerKey;
  if (!key) return;
  event.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }).catch(() => undefined)
  );
});
