"use client";

import { useCallback, useEffect, useRef } from "react";

export type SmartPollOptions = {
  /** Called on each tick when tab is visible */
  tick: () => void | Promise<void>;
  /** Interval while "active" (e.g. import running) */
  activeMs: number;
  /** Interval while idle — set null to stop polling when idle */
  idleMs: number | null;
  /** Whether live updates are needed right now */
  active: boolean;
  /** When false, effect is dormant */
  enabled?: boolean;
  /** Pause/slow when document.hidden */
  pauseWhenHidden?: boolean;
  /** Hidden multiplier — only used if pauseWhenHidden is false and we slow instead */
  hiddenMs?: number;
};

/**
 * Smart polling: fast only when active, slow/stop when idle,
 * pause when tab hidden, one refresh on focus.
 */
export function useSmartPoll(opts: SmartPollOptions) {
  const {
    tick,
    activeMs,
    idleMs,
    active,
    enabled = true,
    pauseWhenHidden = true,
    hiddenMs,
  } = opts;

  const tickRef = useRef(tick);
  tickRef.current = tick;

  const run = useCallback(() => {
    void tickRef.current();
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const clear = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const schedule = () => {
      clear();
      const hidden =
        typeof document !== "undefined" && document.visibilityState !== "visible";

      if (hidden && pauseWhenHidden) {
        return;
      }

      let ms: number | null = active ? activeMs : idleMs;
      if (hidden && !pauseWhenHidden && hiddenMs != null) {
        ms = hiddenMs;
      }
      if (ms == null || ms <= 0) return;

      timer = setInterval(run, ms);
    };

    run();
    schedule();

    const onVis = () => {
      if (document.visibilityState === "visible") {
        run();
      }
      schedule();
    };
    const onFocus = () => {
      run();
    };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    return () => {
      clear();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, [active, activeMs, idleMs, enabled, pauseWhenHidden, hiddenMs, run]);
}
