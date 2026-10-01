import { API_URL, api, tokenStore } from "./api";

// تحديث تلقائي فوري: اتصال مفتوح مع الخادم (SSE عبر fetch حتى نرسل الـ token في الترويسة لا في الرابط).
// عندما يغيّر أي مستخدم بيانات يدفع الخادم "رقم نسخة" جديداً فنُبلّغ الصفحات المشتركة لتعيد تحميل بياناتها بصمت.
// شبكة أمان: فحص دوري خفيف يعمل فقط إذا لم يكن الاتصال المفتوح متاحاً (شبكة/وسيط لا يدعم البث)،
// وحارس يعيد الاتصال إن صمت الخادم أكثر من دقيقة. مراقِب واحد مشترك لكل التطبيق، ويتوقف أثناء إخفاء التبويب.

const POLL_INTERVAL_MS = 4000;
const STREAM_SILENCE_LIMIT_MS = 60_000; // الخادم يرسل نبضة كل 25 ثانية
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 15_000;

const subscribers = new Set<() => void | Promise<unknown>>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastVersion: string | null = null;
let checking = false;

let controller: AbortController | null = null;
let streamConnected = false;
let lastActivity = 0;
let reconnectDelay = RECONNECT_MIN_MS;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function handleVersion(version: string) {
  const changed = lastVersion !== null && version !== lastVersion;
  lastVersion = version;
  if (!changed) return;
  subscribers.forEach((notify) => {
    // فشل مزامنة صامتة لا يجب أن يزعج المستخدم
    void Promise.resolve()
      .then(notify)
      .catch(() => undefined);
  });
}

/** الفحص الدوري الخفيف (شبكة الأمان) */
async function check(): Promise<void> {
  if (checking || document.hidden || !tokenStore.get()) return;
  checking = true;
  try {
    const { version } = await api<{ version: string }>("/sync");
    handleVersion(version);
  } catch {
    // انقطاع مؤقت في الاتصال: نحاول في الدورة التالية
  } finally {
    checking = false;
  }
}

function parseEvents(chunk: string, buffer: { text: string }) {
  buffer.text += chunk;
  let boundary: number;
  while ((boundary = buffer.text.indexOf("\n\n")) !== -1) {
    const rawEvent = buffer.text.slice(0, boundary);
    buffer.text = buffer.text.slice(boundary + 2);
    const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data:"));
    if (!dataLine) continue; // نبضة (تعليق) فقط
    try {
      const { version } = JSON.parse(dataLine.slice(5).trim()) as { version?: string };
      if (typeof version === "string") handleVersion(version);
    } catch {
      // حدث غير مفهوم: نتجاهله
    }
  }
}

async function runStream(signal: AbortSignal): Promise<void> {
  const token = tokenStore.get();
  if (!token) throw new Error("no token");
  const url = new URL(`${API_URL}/sync/stream`, window.location.origin);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" }, signal });
  if (!response.ok || !response.body) throw new Error(`stream ${response.status}`);

  streamConnected = true;
  lastActivity = Date.now();
  reconnectDelay = RECONNECT_MIN_MS;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const buffer = { text: "" };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      lastActivity = Date.now();
      parseEvents(decoder.decode(value, { stream: true }), buffer);
    }
  } finally {
    streamConnected = false;
  }
}

function scheduleReconnect() {
  if (reconnectTimer || subscribers.size === 0) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
}

function connect() {
  if (controller || subscribers.size === 0 || document.hidden || !tokenStore.get()) return;
  const current = new AbortController();
  controller = current;
  runStream(current.signal)
    .catch(() => undefined)
    .finally(() => {
      if (controller === current) controller = null;
      streamConnected = false;
      if (!current.signal.aborted) scheduleReconnect();
    });
}

function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  controller?.abort();
  controller = null;
  streamConnected = false;
}

function tick() {
  // اتصال "ميت" بصمت (وسيط قطعه دون إشعار): نعيد الاتصال
  if (controller && streamConnected && Date.now() - lastActivity > STREAM_SILENCE_LIMIT_MS) {
    disconnect();
    connect();
    return;
  }
  // الفحص الدوري يعمل فقط عند غياب الاتصال المفتوح
  if (!streamConnected) void check();
}

function onVisibilityChange() {
  if (document.hidden) {
    disconnect(); // لا حاجة لاتصال مفتوح والتبويب مخفي
  } else {
    reconnectDelay = RECONNECT_MIN_MS;
    connect();
    void check(); // يلتقط أي تغيير حدث أثناء الإخفاء
  }
}

function onWake() {
  if (document.hidden) return;
  if (!controller) connect();
  void check();
}

function start() {
  if (pollTimer) return;
  pollTimer = setInterval(tick, POLL_INTERVAL_MS);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("focus", onWake);
  window.addEventListener("online", onWake);
  connect();
  void check();
}

function stop() {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("focus", onWake);
  window.removeEventListener("online", onWake);
  disconnect();
}

export function subscribeLiveSync(notify: () => void | Promise<unknown>): () => void {
  subscribers.add(notify);
  start();
  return () => {
    subscribers.delete(notify);
    if (subscribers.size === 0) stop();
  };
}
