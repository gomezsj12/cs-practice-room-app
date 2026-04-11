"use client";

/**
 * @module EventDetailsModal
 *
 * Detail overlay for a calendar event. Shows the event title as the headline
 * (with jam/practice color dot), time range, description text, and — for events the
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
import {
  getCalendarEventKindLabel,
  stripPracticeContactPersonLabel,
} from "@/lib/calendar-events";
import { DescriptionBodyWithLinks } from "@/lib/description-body-links";
import { formatEventModalDateRange } from "@/lib/formatting";
import {
  extractSessionAttendeesLine,
  sessionAttendeePillClass,
} from "@/lib/session-attendees";
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
  const rawDescription = event.description?.trim();
  const practiceDescription =
    !isJam && rawDescription
      ? stripPracticeContactPersonLabel(rawDescription)
      : null;
  const detailsSectionTitle = rawDescription
    ? practiceDescription?.hadLabel
      ? "Contact Person"
      : "Details"
    : null;
  let descriptionBody = practiceDescription?.body ?? rawDescription;
  const sessionAttendeesExtract =
    descriptionBody != null
      ? extractSessionAttendeesLine(descriptionBody)
      : null;
  if (sessionAttendeesExtract) {
    descriptionBody = sessionAttendeesExtract.rest;
  }
  const sessionAttendeeCount = sessionAttendeesExtract?.count;
  const canShowCancelButton = !!event.canCancel && !hasEnded;
  const headlineTitle =
    event.title.trim() ||
    (isJam ? "Jam reservation" : "Practice booking");

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
            className={`inline-block h-3 w-3 shrink-0 rounded-full ${
              isJam ? "bg-[#3f56c9]" : "bg-neutral-500"
            }`}
          />
          <h2 className="min-w-0 flex-1 text-xl font-semibold leading-snug text-white">
            {headlineTitle}
          </h2>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {sessionAttendeeCount != null ? (
            <span
              role="status"
              aria-label={`Session attendees: ${sessionAttendeeCount}`}
              className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${sessionAttendeePillClass(
                sessionAttendeeCount,
              )}`}
            >
              Session attendees: {sessionAttendeeCount}
            </span>
          ) : null}
          <p className="min-w-0 text-xs text-neutral-300">
            {formatEventModalDateRange(start, end)}
          </p>
        </div>

        {rawDescription ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
            {detailsSectionTitle ? (
              <p
                className={
                  detailsSectionTitle === "Contact Person"
                    ? "text-sm font-semibold uppercase tracking-[0.18em] text-neutral-400"
                    : "text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400"
                }
              >
                {detailsSectionTitle}
              </p>
            ) : null}
            {descriptionBody ? (
              <DescriptionBodyWithLinks
                text={descriptionBody}
                className="mt-2 text-sm text-neutral-200"
              />
            ) : null}
          </div>
        ) : null}

        {event.canCancel && hasEnded ? (
          <p className="mt-3 text-sm text-neutral-400">
            {`This ${eventKindLabel} has already ended, so it can\u2019t be cancelled from here.`}
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