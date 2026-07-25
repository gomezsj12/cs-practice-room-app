/**
 * @module QuarterClosedScreen
 *
 * Rendered by the root layout in place of the app when today falls outside
 * any `wwu_quarters` row AND the visitor is not an admin. Shows a fullscreen
 * "closed until [date]" headline, a live d/h/m/s countdown to the next
 * quarter's start, and a slim {@link QuarterClosedAuthCard} so an admin can
 * still sign in to access the app normally.
 *
 * @see {@link @/lib/quarter-window}: `getQuarterGateStatus()` decides when this renders
 */

import { fromZonedTime } from "date-fns-tz";

import QuarterClosedAuthCard from "@/components/QuarterClosedAuthCard";
import QuarterClosedCountdown from "@/components/QuarterClosedCountdown";
import { getRoomTimeZone } from "@/lib/quarter-window";

/** Parses a `YYYY-MM-DD` string into a human-readable date like "Tuesday, September 22, 2026". */
function formatHumanDate(ymd: string): string | null {
  const parts = ymd.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return null;
  }
  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** UTC ISO instant for midnight at the start of `ymd` in the room timezone. */
function startInstantIso(ymd: string): string | null {
  const parts = ymd.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return null;
  }
  try {
    return fromZonedTime(`${ymd}T00:00:00`, getRoomTimeZone()).toISOString();
  } catch {
    return null;
  }
}

export default function QuarterClosedScreen({
  nextStartDate,
}: {
  nextStartDate: string | null;
}) {
  const formattedDate = nextStartDate ? formatHumanDate(nextStartDate) : null;
  const targetIso = nextStartDate ? startInstantIso(nextStartDate) : null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 px-4 py-12 text-center text-white">
      {targetIso ? <QuarterClosedCountdown targetIso={targetIso} /> : null}

      <div className="max-w-xl space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          The Practice Room is closed
          {formattedDate ? (
            <>
              {" "}until{" "}
              <span className="text-blue-200">{formattedDate}</span>
            </>
          ) : null}
        </h1>
        <p className="text-sm leading-relaxed text-neutral-400 sm:text-base">
          {formattedDate
            ? "Check back when the next quarter starts."
            : "Check back once the next quarter has been scheduled."}
        </p>
      </div>

      <QuarterClosedAuthCard />
    </main>
  );
}
