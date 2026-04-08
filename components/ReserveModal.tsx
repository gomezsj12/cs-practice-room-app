"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatBookingDateRange,
  formatHoldSecondsRemaining,
} from "@/lib/formatting";

type ReserveModalProps = {
  isOpen: boolean;
  start: Date | null;
  end: Date | null;
  defaultName?: string | null;
  isSubmitting: boolean;
  expiresAt?: string | null;
  mode: "securing" | "hold" | "fallback";
  dismissOnBackdrop?: boolean;
  onClose: () => void;
  onExpire: () => void;
  onSubmit: (values: { name: string; instrument: string }) => void;
};

export default function ReserveModal({
  isOpen,
  start,
  end,
  defaultName,
  isSubmitting,
  expiresAt,
  mode,
  dismissOnBackdrop = false,
  onClose,
  onExpire,
  onSubmit,
}: ReserveModalProps) {
  const [name, setName] = useState("");
  const [instrument, setInstrument] = useState("Drums");
  const [errorMessage, setErrorMessage] = useState("");
  const [nameLocked, setNameLocked] = useState(false);
  const [nameWasEdited, setNameWasEdited] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  /** Bumps once per second while a hold is active so countdown re-renders without a delayed first paint. */
  const [holdTick, setHoldTick] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const expiredRef = useRef(false);

  const normalizedDefaultName = useMemo(() => {
    const n = defaultName?.trim();
    return n ? n : null;
  }, [defaultName]);

  /** Wall-clock ms until expiry (can be fractional-second); used for expiry, not only display. */
  const holdMsRemaining =
    mode === "hold" && expiresAt
      ? new Date(expiresAt).getTime() - nowMs
      : null;

  /**
   * Whole seconds for display.
   * - Use `Math.ceil` so users see "30 seconds" immediately (not "29" when ~29.9s remains).
   * - Cap at 30 so we never show "31" due to small timing/skew when the server sets expiresAt.
   */
  const holdSecondsRemaining =
    holdMsRemaining === null
      ? null
      : Math.min(30, Math.max(0, Math.ceil(holdMsRemaining / 1000)));

  useEffect(() => {
    if (!isOpen || mode !== "hold" || !expiresAt) {
      return;
    }

    expiredRef.current = false;
    const frameId = window.requestAnimationFrame(() => {
      setNowMs(Date.now());
    });
    const intervalId = window.setInterval(
      () => {
        setHoldTick((t) => t + 1);
        setNowMs(Date.now());
      },
      1000,
    );

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearInterval(intervalId);
    };
  }, [isOpen, mode, expiresAt]);

  useEffect(() => {
    if (mode !== "hold" || !expiresAt) {
      return;
    }
    const msLeft = new Date(expiresAt).getTime() - nowMs;
    if (msLeft > 0 || expiredRef.current) {
      return;
    }
    expiredRef.current = true;
    onExpire();
  }, [mode, expiresAt, nowMs, onExpire, holdTick]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      if (!normalizedDefaultName) {
        setNameLocked(false);
        return;
      }
      // Autofill only when the modal opens with an empty name.
      setName((current) => (current.trim() ? current : normalizedDefaultName));
      setNameLocked(true);
      setNameWasEdited(false);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isOpen, normalizedDefaultName]);

  if (!isOpen || !start || !end) {
    return null;
  }

  const formattedRange = formatBookingDateRange(start, end);
  const isSecuring = mode === "securing";
  const submitDisabled = isSubmitting || isSecuring;
  const inputsDisabled = isSubmitting;
  const holdCountdownUrgent =
    holdSecondsRemaining !== null &&
    holdSecondsRemaining >= 1 &&
    holdSecondsRemaining <= 10;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => {
        if (!dismissOnBackdrop || isSubmitting) {
          return;
        }
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onTouchStart={(e) => {
        if (!dismissOnBackdrop || isSubmitting) {
          return;
        }
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md rounded-3xl border border-neutral-800 bg-[#121212] p-6 text-white shadow-2xl">
        <h2 className="text-xl font-semibold text-white">
          Reserve jam session
        </h2>

        <p className="mt-2 text-sm text-neutral-300">{formattedRange}</p>

        <div className="relative mt-4 isolate">
          <div
            className={`w-full transition-opacity duration-200 ease-out motion-reduce:transition-none ${
              mode === "securing"
                ? "relative z-10 opacity-100"
                : "pointer-events-none absolute left-0 right-0 top-0 z-0 opacity-0"
            }`}
            aria-hidden={mode !== "securing"}
          >
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3">
              <p className="text-sm font-medium text-blue-200">
                Securing your slot...
              </p>
              <p className="mt-1 text-sm text-blue-100/80">
                Please wait while we create a temporary hold.
              </p>
            </div>
          </div>

          <div
            className={`w-full transition-opacity duration-200 ease-out motion-reduce:transition-none ${
              mode === "hold"
                ? "relative z-10 opacity-100"
                : "pointer-events-none absolute left-0 right-0 top-0 z-0 opacity-0"
            }`}
            aria-hidden={mode !== "hold"}
          >
            <div
              className={`rounded-xl border px-4 py-3 transition-colors duration-200 ease-out motion-reduce:transition-none ${
                holdCountdownUrgent
                  ? "border-red-500/45 bg-red-500/15"
                  : "border-neutral-700 bg-white/8"
              }`}
            >
              <p className="text-sm font-medium text-neutral-200">
                Temporary hold active
              </p>
              <p className="mt-1 text-sm text-neutral-400">
                This slot is being held for you for{" "}
                <span className="font-semibold text-white">
                  {holdSecondsRemaining !== null
                    ? formatHoldSecondsRemaining(holdSecondsRemaining)
                    : "—"}
                </span>
                .
              </p>
            </div>
          </div>

          <div
            className={`w-full transition-opacity duration-200 ease-out motion-reduce:transition-none ${
              mode === "fallback"
                ? "relative z-10 opacity-100"
                : "pointer-events-none absolute left-0 right-0 top-0 z-0 opacity-0"
            }`}
            aria-hidden={mode !== "fallback"}
          >
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <p className="text-sm font-medium text-amber-200">
                Temporary hold unavailable
              </p>
              <p className="mt-1 text-sm text-amber-100/80">
                Continuing with standard booking flow. Availability will still be
                checked when you submit.
              </p>
            </div>
          </div>
        </div>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();

            if (isSecuring) {
              return;
            }

            const trimmedName = name.trim();

            if (!trimmedName) {
              setErrorMessage("Please enter your first name.");
              return;
            }

            setErrorMessage("");

            onSubmit({
              name: trimmedName,
              instrument,
            });
          }}
        >
          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <label
                htmlFor="name"
                className="block text-sm font-medium text-neutral-200"
              >
                First name
              </label>
            </div>

            <div className="relative">
              <input
                ref={nameInputRef}
                id="name"
                type="text"
                value={name}
                onChange={(e) => {
                  setNameWasEdited(true);
                  setName(e.target.value);
                }}
                onBlur={() => {
                  if (normalizedDefaultName) {
                    setNameLocked(true);
                  }
                }}
                onFocus={(e) => {
                  if (nameLocked) {
                    e.currentTarget.blur();
                  }
                }}
                onMouseDown={(e) => {
                  if (nameLocked) {
                    e.preventDefault();
                  }
                }}
                onTouchStart={(e) => {
                  if (nameLocked) {
                    e.preventDefault();
                  }
                }}
                disabled={inputsDisabled}
                readOnly={nameLocked}
                className={`w-full rounded-xl border px-3 py-2 pr-11 text-white outline-none disabled:opacity-60 ${
                  nameLocked
                    ? "cursor-default border-neutral-800 bg-neutral-950 text-neutral-300 focus:border-neutral-800"
                    : "border-neutral-700 bg-[#1a1a1a] focus:border-blue-500"
                }`}
                placeholder="Your Name Here..."
              />

              {normalizedDefaultName && nameLocked ? (
                <button
                  type="button"
                  onClick={() => {
                    setNameLocked(false);
                    requestAnimationFrame(() => {
                      nameInputRef.current?.focus();
                      nameInputRef.current?.select();
                    });
                  }}
                  disabled={inputsDisabled}
                  className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-200 transition hover:bg-neutral-900 disabled:opacity-50"
                  aria-label="Edit name"
                  title="Edit name"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M12 20h9"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              ) : null}
            </div>

            {normalizedDefaultName && !nameWasEdited ? (
              <p className="mt-2 text-xs text-neutral-500">
                Autofilled from Google.
              </p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="instrument"
              className="mb-1 block text-sm font-medium text-neutral-200"
            >
              Instrument
            </label>
            <select
              id="instrument"
              value={instrument}
              onChange={(e) => setInstrument(e.target.value)}
              disabled={inputsDisabled}
              className="w-full rounded-xl border border-neutral-700 bg-[#1a1a1a] px-3 py-2 text-white outline-none focus:border-blue-500 disabled:opacity-60"
            >
              <option value="Drums">Drums</option>
              <option value="Piano">Piano</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {errorMessage ? (
            <p className="text-sm font-medium text-red-400">{errorMessage}</p>
          ) : null}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 font-medium text-neutral-200 disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitDisabled}
              className="flex-1 rounded-xl bg-blue-500 px-4 py-2 font-medium text-white disabled:opacity-60"
            >
              {isSecuring
                ? "Securing..."
                : isSubmitting
                  ? "Saving..."
                  : "Reserve"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}