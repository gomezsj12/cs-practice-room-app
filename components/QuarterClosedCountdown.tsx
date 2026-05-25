"use client";

/**
 * @module QuarterClosedCountdown
 *
 * Live days / hours / minutes / seconds counter shown above the
 * {@link QuarterClosedScreen} headline. The server passes the target instant
 * as a UTC ISO string (computed from the next quarter's `start_date` in
 * {@link getRoomTimeZone}); this component renders correct values on first
 * paint by initializing state from `Date.now()` and suppressing the
 * inevitable server/client text mismatch on the number spans.
 */

import { useEffect, useState } from "react";

type Remaining = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

function computeRemaining(targetMs: number, nowMs: number): Remaining {
  const diff = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
  return {
    days: Math.floor(diff / 86_400),
    hours: Math.floor((diff % 86_400) / 3_600),
    minutes: Math.floor((diff % 3_600) / 60),
    seconds: diff % 60,
  };
}

function Cell({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        suppressHydrationWarning
        className="font-bold tabular-nums tracking-tight text-white text-5xl sm:text-7xl md:text-8xl"
      >
        {value.toString().padStart(2, "0")}
      </span>
      <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-400 sm:text-xs">
        {label}
      </span>
    </div>
  );
}

export default function QuarterClosedCountdown({
  targetIso,
}: {
  targetIso: string;
}) {
  const targetMs = new Date(targetIso).getTime();
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!Number.isFinite(targetMs)) return null;

  const { days, hours, minutes, seconds } = computeRemaining(targetMs, now);

  return (
    <div className="flex items-end justify-center gap-5 sm:gap-10">
      <Cell value={days} label="Days" />
      <Cell value={hours} label="Hours" />
      <Cell value={minutes} label="Minutes" />
      <Cell value={seconds} label="Seconds" />
    </div>
  );
}
