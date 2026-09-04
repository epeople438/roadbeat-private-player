"use client";

import { useEffect, useState } from "react";
import { THEME_KEY, type ThemeMode } from "../lib/types";

/**
 * Owns the light/dark choice: reads the stored preference on mount, mirrors it
 * onto the document, and keeps the iOS status bar and browser theme colour in
 * step. `ready` stays false until the stored value has been applied so the app
 * never paints the default theme over the user's choice.
 */
export function useTheme() {
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    let active = true;
    let stored: ThemeMode = "dark";
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") stored = saved;
    } catch {
      // Private browsing can restrict access to local preferences.
    }
    // Deferred so the first paint is not followed by a cascading re-render.
    queueMicrotask(() => {
      if (!active) return;
      setThemeMode(stored);
      setThemeReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!themeReady) return;

    document.documentElement.dataset.theme = themeMode;
    try {
      localStorage.setItem(THEME_KEY, themeMode);
    } catch {
      // The visual theme still works for the current session.
    }

    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", themeMode === "light" ? "#faf7f1" : "#0b0c10");
    // Kept in sync for completeness, but iOS only reads this at launch — the
    // value that matters is the one the boot script writes before first paint.
    document
      .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
      ?.setAttribute(
        "content",
        themeMode === "light" ? "default" : "black-translucent",
      );
  }, [themeMode, themeReady]);

  return { themeMode, setThemeMode, themeReady };
}
