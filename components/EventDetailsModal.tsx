"use client";

/**
 * @module EventDetailsModal
 *
 * Detail overlay for a calendar event. Shows the event title, time range,
 * type badge (jam / practice), description text, and — for events the
 * current user owns — a cancel button (gated behind a {@link ConfirmModal}).
 *
 * A live "has ended" check (`nowMs >= end`) disables the cancel action once
 * the event's end time has passed, even if the modal was opened before it
 * ended. The timestamp is captured via `requestAnimationFrame` each time the
 * modal opens, so the check is fresh without continuous polling.
 *
 * @see CalendarView — opens this modal on event click
 * @see ConfirmModal — secondary confirmation before actual cancellation
 */

import { useEffect, useState } from "react";
import { getCalendarEventKindLabel } from "@/lib/calendar-events";
import { formatBookingDateRange } from "@/lib/formatting";
import type { CalendarEvent } from "@/lib/types";

type EventDetailsModalProps = {
  isOpen: boolean;
  event: CalendarEvent | null;
  isCancelling: boolean;
  dismissOnBackdrop?: boolean;
  onClose: () => void;
  onCancel: () => void;
};

/**
 * Displays event details in a fixed overlay with an optional owner-only cancel
 * action and the event description when one is available.
 *
 * @param props.isOpen - Controls visibility; renders `null` when closed.
 * @param props.event - The calendar event to display, or `null` if none selected.
 * @param props.isCancelling - Disables buttons while a cancellation API call is in-flight.
 * @param props.dismissOnBackdrop - When `true`, tapping the backdrop closes the modal.
 * @param props.onClose - Callback to close the modal.
 * @param props.onCancel - Callback to initiate cancellation (opens ConfirmModal upstream).
 */
export default function EventDetailsModal({
  isOpen,
  event,
  isCancelling,
  dismissOnBackdrop = false,
  onClose,
  onCancel,
}: EventDetailsModalProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isOpen || !event) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setNowMs(Date.now());
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [event, isOpen]);

  if (!isOpen || !event) {
    return null;
  }

  const isJam = event.eventType === "jam";
  const eventKindLabel = getCalendarEventKindLabel(event.eventType);
  const start = new Date(event.start);
  const end = new Date(event.end);
  const hasEnded = nowMs >= end.getTime();
  const description = event.description?.trim();
  const canShowCancelButton = !!event.canCancel && !hasEnded;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => {
        if (!dismissOnBackdrop) {
          return;
        }
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onTouchStart={(e) => {
        if (!dismissOnBackdrop) {
          return;
        }
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md rounded-3xl border border-neutral-800 bg-[#121212] p-6 text-white shadow-2xl">
        <div className="mb-4 flex items-center gap-2">
          <span
            className={`inline-block h-3 w-3 rounded-full ${
              isJam ? "bg-[#3f56c9]" : "bg-neutral-500"
            }`}
          />
          <h2 className="text-xl font-semibold text-white">
            {isJam ? "Jam reservation" : "Practice booking"}
          </h2>
        </div>

        <p className="text-base font-medium text-white">{event.title}</p>

        <p className="mt-2 text-sm text-neutral-300">
          {formatBookingDateRange(start, end)}
        </p>

        {description ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
              Details
            </p>
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-neutral-200">
              {description}
            </p>
          </div>
        ) : null}

        {event.canCancel && hasEnded ? (
          <p className="mt-3 text-sm text-neutral-400">
            This {eventKindLabel} has already ended, so it can&apos;t be
            cancelled from here.
          </p>
        ) : null}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isCancelling}
            className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 font-medium text-neutral-200 disabled:opacity-60"
          >
            Close
          </button>

          {canShowCancelButton ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={isCancelling}
              className="flex-1 rounded-xl bg-red-500 px-4 py-2 font-medium text-white disabled:opacity-60"
            >
              {isCancelling
                ? "Cancelling..."
                : isJam
                  ? "Cancel reservation"
                  : "Cancel booking"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}