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

/** يُستدعى من حدث مستخدم (نقرة/لمسة) ليسمح المتصفح بتشغيل الصوت لاحقاً دون تفاعل. */
export function unlockAudio(): void {
  const c = context();
  if (c && c.state === "suspended") void c.resume().catch(() => undefined);
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

/** يشغّل الإنذار. يعيد true إن بدأ التشغيل فعلاً (false إن كان مكتوماً أو لم يُفتح الصوت بعد). */
export function playAlarm(kind: AlarmKind): boolean {
  if (isAlarmMuted()) return false;
  const c = context();
  if (!c) return false;
  if (c.state === "suspended") void c.resume().catch(() => undefined);
  if (c.state === "suspended") return false; // لم يُفتح الصوت بعد (لا تفاعل سابق)

  stopAlarm();
  const { freqs, beep, gap, repeats } = PATTERNS[kind];
  const gain = c.createGain();
  gain.gain.value = 0.0001;
  gain.connect(c.destination);

  let t = c.currentTime + 0.02;
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
  const last = oscillators[oscillators.length - 1];
  const stop = () => {
    for (const o of oscillators) {
      try {
        o.stop();
      } catch {
        // انتهى بالفعل
      }
    }
    gain.disconnect();
  };
  activeStop = stop;
  if (last) {
    last.onended = () => {
      if (activeStop === stop) activeStop = null;
      gain.disconnect();
    };
  }
  if (kind !== "chime" && "vibrate" in navigator) navigator.vibrate?.([300, 150, 300, 150, 600]);
  return true;
}
