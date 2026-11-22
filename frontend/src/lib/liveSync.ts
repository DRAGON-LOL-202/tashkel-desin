import { API_URL, api, tokenStore } from "./api";

// تحديث تلقائي فوري: اتصال مفتوح مع الخادم (SSE عبر fetch حتى نرسل الـ token في الترويسة لا في الرابط).
// عندما يغيّر أي مستخدم بيانات يدفع الخادم رقم النسخة والقنوات المتأثرة فتعيد الصفحات المعنية فقط التحميل بهدوء (مع debounce 350ms).
// شبكة أمان: فحص دوري خفيف يعمل فقط إذا لم يكن الاتصال المفتوح متاحاً، ويتوقف أثناء إخفاء التبويب.

export type SyncChannel = "tasks" | "inventory" | "sales" | "accounting" | "users" | "notifications" | "general";

interface SyncPayload {
  version: string;
  channels?: Partial<Record<SyncChannel, number>>;
}

interface Subscriber {
  notify: () => void | Promise<unknown>;
  channels?: readonly SyncChannel[];
  timer: ReturnType<typeof setTimeout> | null;
}

const POLL_INTERVAL_MS = 4000;
const STREAM_SILENCE_LIMIT_MS = 40_000; // الخادم يرسل نبضة كل 25 ثانية
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 15_000;
const DEBOUNCE_MS = 200;

const subscribers = new Set<Subscriber>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastVersion: string | null = null;
let lastBootId: string | null = null;
let lastChannels: Partial<Record<SyncChannel, number>> = {};
let checking = false;

let controller: AbortController | null = null;
let streamConnected = false;
let lastActivity = 0;
let connectStartedAt = 0;
let reconnectDelay = RECONNECT_MIN_MS;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleNotify(sub: Subscriber) {
  if (sub.timer) clearTimeout(sub.timer);
  sub.timer = setTimeout(() => {
    sub.timer = null;
    // فشل مزامنة صامتة لا يجب أن يزعج المستخدم
    void Promise.resolve()
      .then(sub.notify)
      .catch(() => undefined);
  }, DEBOUNCE_MS);
}

function handleSnapshot(payload: SyncPayload) {
  const version = payload.version;
  const bootId = version.split(".")[0] ?? version;
  const changed = lastVersion !== null && version !== lastVersion;
  const rebooted = lastBootId !== null && bootId !== lastBootId;
  const prevChannels = lastChannels;
  const nextChannels = payload.channels ?? {};
  const generalChanged = nextChannels.general !== prevChannels.general;

  lastVersion = version;
  lastBootId = bootId;
  lastChannels = nextChannels;
  if (!changed) return;

  subscribers.forEach((sub) => {
    if (!rebooted && !generalChanged && sub.channels && sub.channels.length > 0 && payload.channels) {
      const relevantChanged = sub.channels.some((ch) => nextChannels[ch] !== prevChannels[ch]);
      if (!relevantChanged) return;
    }
    scheduleNotify(sub);
  });
}

/** الفحص الدوري الخفيف (شبكة الأمان) */
async function check(): Promise<void> {
  if (checking || document.hidden || !tokenStore.get()) return;
  checking = true;
  try {
    const data = await api<SyncPayload>("/sync");
    if (typeof data.version === "string") handleSnapshot(data);
  } catch {
    // انقطاع مؤقت في الاتصال: نحاول في الدورة التالية
  } finally {
    checking = false;
  }
}

function parseEvents(chunk: string, buffer: { text: string }) {
  buffer.text = (buffer.text + chunk).replace(/\r\n/g, "\n").replace(/\r(?!$)/g, "\n");
  let boundary: number;
  while ((boundary = buffer.text.indexOf("\n\n")) !== -1) {
    const rawEvent = buffer.text.slice(0, boundary);
    buffer.text = buffer.text.slice(boundary + 2);
    const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data:"));
    if (!dataLine) continue; // نبضة (تعليق) فقط
    try {
      const data = JSON.parse(dataLine.slice(5).trim()) as Partial<SyncPayload>;
      if (typeof data.version === "string") handleSnapshot({ version: data.version, channels: data.channels });
    } catch {
      // حدث غير مفهوم: نتجاهله
    }
  }
}

async function runStream(signal: AbortSignal): Promise<void> {
  const token = tokenStore.get();
  if (!token) throw new Error("no token");
  const url = new URL(`${API_URL}/sync/stream`, window.location.origin);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
    cache: "no-store",
    signal,
  });
  if (!response.ok || !response.body) throw new Error(`stream ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const buffer = { text: "" };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        streamConnected = true;
        lastActivity = Date.now();
        reconnectDelay = RECONNECT_MIN_MS;
        parseEvents(decoder.decode(value, { stream: true }), buffer);
      }
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
  connectStartedAt = Date.now();
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
  // اتصال "ميت" بصمت (وسيط قطعه أو حجزه دون إشعار): نعيد الاتصال ونفحص فوراً
  if (
    controller &&
    ((streamConnected && Date.now() - lastActivity > STREAM_SILENCE_LIMIT_MS) ||
      (!streamConnected && Date.now() - connectStartedAt > STREAM_SILENCE_LIMIT_MS))
  ) {
    disconnect();
    connect();
    void check();
    return;
  }
  // الفحص الدوري يعمل فقط عند غياب الاتصال المفتوح الفعلي
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

export function resetLiveSync(): void {
  disconnect();
  lastVersion = null;
  lastBootId = null;
  lastChannels = {};
  reconnectDelay = RECONNECT_MIN_MS;
  connectStartedAt = 0;
}

export function subscribeLiveSync(notify: () => void | Promise<unknown>, channels?: readonly SyncChannel[]): () => void {
  const sub: Subscriber = { notify, channels, timer: null };
  subscribers.add(sub);
  start();
  return () => {
    if (sub.timer) {
      clearTimeout(sub.timer);
      sub.timer = null;
    }
    subscribers.delete(sub);
    if (subscribers.size === 0) stop();
  };
}
