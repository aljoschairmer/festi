"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "festi-cookie-consent";
/**
 * Published on the root element while the banner is on screen so page
 * furniture pinned to the bottom (the site footer) can move out of its way.
 * Without it the banner sits exactly on top of the Imprint/Privacy/Terms
 * links — both are anchored to `bottom-0`.
 */
const HEIGHT_VAR = "--cookie-banner-height";

export function CookieConsent() {
  // `null` = not yet determined (avoids a flash before we read storage).
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        // Defer one tick so the enter transition plays.
        const t = setTimeout(() => setVisible(true), 400);
        return () => clearTimeout(t);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  // Keep the published height in sync with the rendered banner (its height
  // depends on the viewport: one row on desktop, stacked on a phone).
  useEffect(() => {
    const root = document.documentElement;
    const clear = () => root.style.removeProperty(HEIGHT_VAR);
    if (!visible) {
      clear();
      return clear;
    }
    const el = bannerRef.current;
    if (!el) return clear;
    const publish = () =>
      root.style.setProperty(HEIGHT_VAR, `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      clear();
    };
  }, [visible]);

  const accept = () => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ accepted: true, at: Date.now() }),
      );
    } catch {
      // Ignore storage errors (e.g. private mode); banner just won't persist.
    }
    setVisible(false);
  };

  if (!mounted) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie notice"
      className={`fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 transition-all duration-500 ease-out ${
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-full opacity-0"
      }`}
    >
      <div
        ref={bannerRef}
        className="flex w-full max-w-3xl flex-col gap-4 rounded-xl border border-border bg-card/95 p-5 shadow-2xl shadow-black/40 backdrop-blur sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="text-sm text-muted-foreground">
          We use only essential cookies needed to keep you signed in and to keep
          Festi secure. See our{" "}
          <Link
            href="/privacy"
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            Privacy Policy
          </Link>
          .
        </p>
        <Button
          onClick={accept}
          className="w-full shrink-0 bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 sm:w-auto"
        >
          Got it
        </Button>
      </div>
    </div>
  );
}
