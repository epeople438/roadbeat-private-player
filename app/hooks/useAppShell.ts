"use client";

import { useEffect, useState } from "react";

/**
 * Environment concerns that have nothing to do with music: how tall the usable
 * viewport is, whether the app was launched from the home screen, whether the
 * network is up, and registering the service worker.
 */
export function useAppShell() {
  const [isStandalone, setIsStandalone] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    let active = true;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    // Deferred so the first paint is not followed by a cascading re-render.
    queueMicrotask(() => {
      if (!active) return;
      setIsStandalone(standalone);
      setIsOnline(navigator.onLine);
    });

    // Desktop keeps a phone-shaped frame sized to the real viewport; mobile
    // pins itself to the visual viewport in CSS instead.
    const syncAppHeight = () => {
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const measuredHeight = Math.max(viewportHeight, window.innerHeight);
      document.documentElement.style.setProperty(
        "--roadbeat-app-height",
        `${Math.round(measuredHeight)}px`,
      );
    };
    syncAppHeight();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("resize", syncAppHeight);
    window.addEventListener("orientationchange", syncAppHeight);
    window.visualViewport?.addEventListener("resize", syncAppHeight);

    const registerServiceWorker = () => {
      const isLocalPreview =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
      if ("serviceWorker" in navigator && !isLocalPreview) {
        void navigator.serviceWorker.register(
          new URL("sw.js", document.baseURI).href,
        );
      }
    };
    if (document.readyState === "complete") registerServiceWorker();
    else window.addEventListener("load", registerServiceWorker, { once: true });

    return () => {
      active = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("resize", syncAppHeight);
      window.removeEventListener("orientationchange", syncAppHeight);
      window.visualViewport?.removeEventListener("resize", syncAppHeight);
      window.removeEventListener("load", registerServiceWorker);
      document.documentElement.style.removeProperty("--roadbeat-app-height");
    };
  }, []);

  return { isStandalone, isOnline };
}
