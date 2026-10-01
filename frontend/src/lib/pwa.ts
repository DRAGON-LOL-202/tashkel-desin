import { useSyncExternalStore } from "react";

// تثبيت الموقع كتطبيق (PWA).
// حدث beforeinstallprompt يُطلق مرة واحدة وقد يسبق تحميل أي صفحة، لذلك نلتقطه هنا على مستوى الـ module
// ونشاركه مع أي مكوّن عبر useInstallApp().

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallState {
  /** المتصفح جاهز لعرض نافذة التثبيت الأصلية (Chrome / Edge / Android) */
  canPrompt: boolean;
  /** التطبيق مثبّت ويعمل الآن كتطبيق مستقل */
  installed: boolean;
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return window.matchMedia?.("(display-mode: standalone)").matches || iosStandalone;
}

export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const iPadOS = navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || iPadOS;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let state: InstallState = { canPrompt: false, installed: detectStandalone() };
const listeners = new Set<() => void>();

function update(next: Partial<InstallState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

let initialized = false;

export function initPwa(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    update({ canPrompt: true });
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    update({ canPrompt: false, installed: true });
  });

  // الـ Service Worker في الإنتاج فقط حتى لا يتعارض مع التطوير المحلي (HMR)
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // فشل التسجيل لا يؤثر على عمل الموقع
      });
    });
  }
}

/** يعرض نافذة التثبيت الأصلية. يعيد true إذا وافق المستخدم. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const promptEvent = deferredPrompt;
  deferredPrompt = null;
  update({ canPrompt: false });
  await promptEvent.prompt();
  const { outcome } = await promptEvent.userChoice;
  return outcome === "accepted";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useInstallApp() {
  const current = useSyncExternalStore(subscribe, () => state, () => state);
  const ios = isIOSDevice();
  return {
    ...current,
    isIOS: ios,
    /** نُظهر زر التثبيت إن كان المتصفح يدعمه، أو على iOS (حيث التثبيت يدوي من قائمة المشاركة) */
    showInstall: !current.installed && (current.canPrompt || ios),
  };
}
