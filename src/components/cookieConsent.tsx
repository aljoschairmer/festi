"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "festi-cookie-consent";

/** Consumed by the footer so it can clear the banner instead of hiding behind it. */
const HEIGHT_VAR = "--cookie-banner-height";

export type ConsentChoice = "accepted" | "rejected";

/**
 * Window event dispatched whenever the user makes or changes a consent
 * choice. Optional integrations (e.g. analytics loaders) can listen for it
 * to react without a page reload.
 */
export const CONSENT_CHANGED_EVENT = "festi-consent-changed";

type StoredConsent = {
  choice?: ConsentChoice;
  /** Legacy format written before the explicit accept/reject choice. */
  accepted?: boolean;
  at?: number;
};

/**
 * Reads the stored consent choice. Returns `null` when the user has not
 * decided yet (or storage is unavailable, e.g. private mode).
 */
export function getConsentChoice(): ConsentChoice | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (parsed.choice === "accepted" || parsed.choice === "rejected") {
      return parsed.choice;
    }
    if (parsed.accepted === true) return "accepted";
    return null;
  } catch {
    return null;
  }
}

function storeConsent(choice: ConsentChoice) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ choice, at: Date.now() }),
    );
  } catch {
    // Ignore storage errors (e.g. private mode); banner just won't persist.
  }
  window.dispatchEvent(
    new CustomEvent<ConsentChoice>(CONSENT_CHANGED_EVENT, { detail: choice }),
  );
}

export function CookieConsent() {
  // `null` = not yet determined (avoids a flash before we read storage).
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const bannerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
    if (getConsentChoice() === null) {
      // Defer one tick so the enter transition plays.
      const t = setTimeout(() => setVisible(true), 400);
      return () => clearTimeout(t);
    }
  }, []);

  // Publish the rendered height so the footer can sit above the banner
  // instead of behind it. It has to be measured rather than assumed: the
  // banner is one row on a desktop and stacks on a phone.
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

  const choose = (choice: ConsentChoice) => {
    storeConsent(choice);
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
          We use essential cookies to keep you signed in and to keep Festi
          secure. With your consent we also use analytics cookies to improve the
          service. See our{" "}
          <Link
            href="/privacy"
            className="text-primary underline underline-offset-2 hover:text-primary-hover"
          >
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
          <Button
            variant="outline"
            onClick={() => choose("rejected")}
            className="w-full sm:w-auto"
          >
            Decline
          </Button>
          <Button
            onClick={() => choose("accepted")}
            className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 sm:w-auto"
          >
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
