"use client";

/**
 * @module EventDetailsModal
 *
 * Read-only detail overlay for a calendar event. Shows the event title,
 * time range, type badge (jam / practice), and — for the user's own jam
 * reservations — a cancel button (gated behind a {@link ConfirmModal}).
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
 * Displays event details in a fixed overlay with an optional cancel action.
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
  const start = new Date(event.start);
  const end = new Date(event.end);
  const hasEnded = nowMs >= end.getTime();

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

        {isJam ? (
          !event.canCancel ? (
            <p className="mt-3 text-sm text-neutral-400">
              Only the creator of this reservation can cancel it.
            </p>
          ) : hasEnded ? (
            <p className="mt-3 text-sm text-neutral-400">
              This reservation has already ended, so it can&apos;t be cancelled
              from here.
            </p>
          ) : (
            <p className="mt-3 text-sm text-neutral-400">
              This reservation can be cancelled from here.
            </p>
          )
        ) : (
          <p className="mt-3 text-sm text-neutral-400">
            Practice bookings are view-only in this scheduler.
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isCancelling}
            className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 font-medium text-neutral-200 disabled:opacity-60"
          >
            Close
          </button>

          {isJam && event.canCancel && !hasEnded ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={isCancelling}
              className="flex-1 rounded-xl bg-red-500 px-4 py-2 font-medium text-white disabled:opacity-60"
            >
              {isCancelling ? "Cancelling..." : "Cancel reservation"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}