import { toast } from "sonner";

const STORAGE_KEY = "logo-click-streak";
const WINDOW_MS = 2000;
const THRESHOLD = 5;

export function triggerLogoEasterEgg() {
  const now = Date.now();
  const stored = sessionStorage.getItem(STORAGE_KEY);
  let count = 1;
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as { count: number; ts: number };
      if (now - parsed.ts < WINDOW_MS) {
        count = parsed.count + 1;
      }
    } catch {}
  }
  if (count >= THRESHOLD) {
    toast("2025 테니스부 주장단 포에버 🎾");
    sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ count, ts: now }));
}
