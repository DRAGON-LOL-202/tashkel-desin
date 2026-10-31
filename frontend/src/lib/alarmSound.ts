// صوت إنذار داخل الموقع (WebAudio) بلا ملف صوتي. المتصفحات تمنع الصوت قبل أي تفاعل من المستخدم،
// لذلك نفتح الـ AudioContext عند أول لمسة/نقرة (unlockAudio) ثم نستخدمه لاحقاً بلا قيود.
const MUTE_KEY = "tashkeel_alarm_muted";

type AudioCtor = typeof AudioContext;
let ctx: AudioContext | null = null;
let activeStop: (() => void) | null = null;
const recent = new Map<string, number>();
const DEDUPE_MS = 90_000;

export function isAlarmMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAlarmMuted(muted: boolean): void {
  try {
    if (muted) localStorage.setItem(MUTE_KEY, "1");
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    // التخزين غير متاح: يبقى الإعداد للجلسة الحالية فقط
  }
  if (muted) stopAlarm();
}

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/**
 * يُستدعى من حدث مستخدم (نقرة/لمسة) ليسمح المتصفح بتشغيل الصوت لاحقاً دون تفاعل.
 * يعيد وعداً لا يفشل أبداً، ينتهي حين يصبح الصوت جاهزاً (أو تعذّر ذلك).
 */
export function unlockAudio(): Promise<void> {
  const c = context();
  if (!c || c.state !== "suspended") return Promise.resolve();
  return c.resume().catch(() => undefined);
}

export function stopAlarm(): void {
  activeStop?.();
  activeStop = null;
}

export type AlarmKind = "chime" | "warning" | "expired";

const PATTERNS: Record<AlarmKind, { freqs: number[]; beep: number; gap: number; repeats: number }> = {
  chime: { freqs: [880, 1320], beep: 0.18, gap: 0.06, repeats: 1 },
  warning: { freqs: [740, 740], beep: 0.22, gap: 0.12, repeats: 2 },
  expired: { freqs: [988, 784], beep: 0.28, gap: 0.14, repeats: 6 },
};

/**
 * يعيد true مرة واحدة فقط لكل مفتاح خلال 90 ثانية. نستخدمه حتى لا يتكرر نفس الإنذار/التنبيه
 * عندما يصل الحدث من مصدرين (العدّاد المحلي ثم رسالة Push لنفس المهمة).
 */
export function claimOnce(key: string): boolean {
  const now = Date.now();
  const last = recent.get(key);
  if (last !== undefined && now - last < DEDUPE_MS) return false;
  recent.set(key, now);
  for (const [k, at] of recent) if (now - at > DEDUPE_MS * 4) recent.delete(k);
  return true;
}

/** أقصى مدة يظل فيها الإنذار المتكرر يرنّ إن لم يوافق عليه أحد (حتى لا يرنّ للأبد في تبويب منسي). */
const LOOP_MAX_MS = 15 * 60_000;
/** فاصل صمت بين كل دورة ودورة في الإنذار المتكرر */
const LOOP_GAP_S = 1.2;
/** نجدول الصوت مقدّماً بهذا القدر على ساعة الصوت نفسها، فلا يتوقف الرنين إن تأخرت أحداث الصفحة (تبويب خلفي) */
const LOOKAHEAD_S = 30;
const WATCHDOG_MS = 1000;

let loopActive = false;

/** هل يرنّ الآن إنذار متكرر (انتهاء وقت) لم يوافق عليه المستخدم بعد؟ */
export function isAlarmLooping(): boolean {
  return loopActive;
}

/**
 * يشغّل الإنذار. يعيد true إن بدأ التشغيل فعلاً (false إن كان مكتوماً أو لم يُفتح الصوت بعد).
 * مع `loop: true` تتكرر النغمة بلا توقف حتى يُستدعى `stopAlarm()` (أو تمرّ 15 دقيقة).
 * أثناء رنين إنذار متكرر لا يقطعه أي صوت قصير آخر (تنبيه «باقي دقيقة» المتأخر، تجربة، ...): يُتجاهل.
 */
export function playAlarm(kind: AlarmKind, options: { loop?: boolean } = {}): boolean {
  const loop = options.loop === true;
  if (loopActive && !loop) return false; // لا نقطع إنذار «انتهى الوقت» الجاري
  if (isAlarmMuted()) return false;
  const c = context();
  if (!c) return false;
  if (c.state === "suspended") void c.resume().catch(() => undefined);
  if (c.state === "suspended") return false; // لم يُفتح الصوت بعد (لا تفاعل سابق)

  stopAlarm();
  const { freqs, beep, gap, repeats } = PATTERNS[kind];
  const startedAt = Date.now();
  let stopped = false;
  let scheduledUntil = c.currentTime + 0.02; // آخر لحظة (بساعة الصوت) جُدول عندها صوت
  let watchdog: ReturnType<typeof setInterval> | null = null;
  const live = new Set<{ oscillators: OscillatorNode[]; gain: GainNode }>();

  const scheduleCycle = () => {
    const gain = c.createGain();
    gain.gain.value = 0.0001;
    gain.connect(c.destination);
    let t = scheduledUntil;
    const oscillators: OscillatorNode[] = [];
    for (let r = 0; r < repeats; r++) {
      for (const f of freqs) {
        const osc = c.createOscillator();
        osc.type = "sine";
        osc.frequency.value = f;
        osc.connect(gain);
        // نغمة بداية/نهاية ناعمة حتى لا يُسمع «طقطقة»
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + beep);
        osc.start(t);
        osc.stop(t + beep + 0.01);
        oscillators.push(osc);
        t += beep + gap;
      }
    }
    scheduledUntil = t + (loop ? LOOP_GAP_S : 0);
    const cycle = { oscillators, gain };
    live.add(cycle);
    const last = oscillators[oscillators.length - 1];
    if (last) {
      last.onended = () => {
        if (!live.delete(cycle)) return;
        gain.disconnect();
        if (!loop && live.size === 0 && !stopped) {
          // انتهى الإنذار غير المتكرر بنفسه
          stop();
        }
      };
    }
  };

  // نملأ ساعة الصوت حتى LOOKAHEAD_S؛ يستدعيها المراقب كل ثانية، فلا نعتمد على أحداث onended وحدها
  const topUp = () => {
    if (stopped) return;
    if (Date.now() - startedAt >= LOOP_MAX_MS) {
      stop();
      return;
    }
    if (c.state !== "running") void c.resume().catch(() => undefined); // قطعه النظام (مثلاً iOS) ← نحاول استئنافه
    while (scheduledUntil - c.currentTime < LOOKAHEAD_S) scheduleCycle();
  };

  const wake = () => {
    if (document.visibilityState === "visible") topUp();
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (watchdog !== null) clearInterval(watchdog);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", wake);
    c.removeEventListener?.("statechange", topUp);
    for (const cycle of live) {
      for (const o of cycle.oscillators) {
        try {
          o.stop();
        } catch {
          // انتهى بالفعل
        }
      }
      cycle.gain.disconnect();
    }
    live.clear();
    if (loop) loopActive = false;
    if (activeStop === stop) activeStop = null;
  };

  activeStop = stop;
  if (loop) {
    loopActive = true;
    topUp();
    watchdog = setInterval(topUp, WATCHDOG_MS);
    // العودة للتبويب أو استئناف الصوت بعد انقطاع: نكمل الرنين فوراً
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", wake);
    c.addEventListener?.("statechange", topUp);
  } else {
    scheduleCycle();
  }
  if (kind !== "chime" && "vibrate" in navigator) navigator.vibrate?.([300, 150, 300, 150, 600]);
  return true;
}
