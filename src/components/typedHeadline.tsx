"use client";

import { useEffect, useState } from "react";

type Segment = { text: string; gradient?: boolean };

const SEGMENTS: Segment[] = [
  { text: "Plan. Connect. " },
  { text: "Ride.", gradient: true },
];

const FULL_TEXT = SEGMENTS.map((s) => s.text).join("");
const TYPING_SPEED_MS = 90;
const START_DELAY_MS = 300;

export function TypedHeadline() {
  const [count, setCount] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReduced) {
      setCount(FULL_TEXT.length);
      setDone(true);
      return;
    }

    let index = 0;
    let interval: ReturnType<typeof setInterval>;

    const start = setTimeout(() => {
      interval = setInterval(() => {
        index += 1;
        setCount(index);
        if (index >= FULL_TEXT.length) {
          clearInterval(interval);
          setDone(true);
        }
      }, TYPING_SPEED_MS);
    }, START_DELAY_MS);

    return () => {
      clearTimeout(start);
      clearInterval(interval);
    };
  }, []);

  let remaining = count;

  return (
    <h1
      aria-label={FULL_TEXT}
      className="whitespace-nowrap text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl"
    >
      <span aria-hidden="true">
        {SEGMENTS.map((segment) => {
          const visible = segment.text.slice(0, Math.max(0, remaining));
          remaining -= segment.text.length;
          return (
            <span
              key={segment.text}
              className={
                segment.gradient
                  ? "bg-gradient-to-r from-red-500 to-red-600 bg-clip-text text-transparent"
                  : undefined
              }
            >
              {visible}
            </span>
          );
        })}
        <span
          className={`ml-0.5 inline-block w-[0.06em] -translate-y-[0.05em] self-center bg-primary align-middle ${
            done ? "animate-caret-blink" : "opacity-100"
          }`}
          style={{ height: "0.9em" }}
        />
      </span>
    </h1>
  );
}
