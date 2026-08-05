"use client";

import { useEffect } from "react";

/**
 * Hide Next.js / React Dev Error Overlay unless NEXT_PUBLIC_DEBUG=true.
 * Also converts unhandled rejections into quiet string logs (no Error object
 * passed to console.error — that alone opens the Issues panel).
 */
export function AppOverlayGuard() {
  useEffect(() => {
    const debug = process.env.NEXT_PUBLIC_DEBUG === "true";

    const hideOverlay = () => {
      if (debug) return;
      try {
        document.querySelectorAll("nextjs-portal").forEach((el) => {
          (el as HTMLElement).style.setProperty("display", "none", "important");
        });
        document
          .querySelectorAll(
            "[data-nextjs-dialog-overlay], [data-nextjs-toast], [data-next-mark]"
          )
          .forEach((el) => {
            (el as HTMLElement).style.setProperty("display", "none", "important");
          });
      } catch {
        /* ignore */
      }
    };

    hideOverlay();
    const obs = new MutationObserver(hideOverlay);
    obs.observe(document.documentElement, { childList: true, subtree: true });

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "unhandled rejection";
      // Never console.error(Error) — triggers Next Issues
      console.warn(`[app] unhandled rejection: ${msg.slice(0, 200)}`);
      if (!debug) event.preventDefault();
    };

    const onError = (event: ErrorEvent) => {
      console.warn(`[app] window error: ${(event.message || "").slice(0, 200)}`);
      if (!debug) {
        event.preventDefault();
      }
    };

    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);

    return () => {
      obs.disconnect();
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}
