"use client";

/**
 * @module EventDetailsModal
 *
 * Detail overlay for a calendar event. Shows the event title as the headline
 * (with jam/practice color dot), time range, description text, and — for events the
 * current user owns — a cancel button (gated behind a {@link ConfirmModal}).
 *
 * **Admin controls** (practice events only, when `isAdmin` is true):
 * - Notion icon button that opens the linked Notion page
 * - Editable start/end times (same-day only)
 * - Status dropdown matching Notion's Session Status options
 * - Assignee(s) multi-select (People directory) beside the time pickers
 * - Draft-then-apply: "Close" becomes "Apply Changes" when dirty
 *
 * A live "has ended" check (`nowMs >= end`) disables the cancel action once
 * the event's end time has passed, even if the modal was opened before it
 * ended. The timestamp is captured via `requestAnimationFrame` each time the
 * modal opens, so the check is fresh without continuous polling.
 *
 * @see CalendarView — opens this modal on event click
 * @see ConfirmModal — secondary confirmation before actual cancellation
 */

import { useEffect, useRef, useState } from "react";
import {
  getCalendarEventKindLabel,
  stripPracticeContactPersonLabel,
} from "@/lib/calendar-events";
import { DescriptionBodyWithLinks } from "@/lib/description-body-links";
import { formatEventModalDateRange } from "@/lib/formatting";
import { getStatusColor } from "@/lib/practice-session-status";
import {
  extractSessionAttendeesLine,
  sessionAttendeePillClass,
} from "@/lib/session-attendees";
import type {
  CalendarEvent,
  PracticeNotionDetails,
  PracticeSessionChanges,
} from "@/lib/types";
import PracticeAssigneePicker from "@/components/PracticeAssigneePicker";
import PracticeStatusDropdown from "@/components/PracticeStatusDropdown";
import TimePicker from "@/components/TimePicker";

type EventDetailsModalProps = {
  isOpen: boolean;
  event: CalendarEvent | null;
  isCancelling: boolean;
  dismissOnBackdrop?: boolean;
  onClose: () => void;
  onCancel: () => void;
  isAdmin?: boolean;
  notionDetails?: PracticeNotionDetails | null;
  isLoadingNotionDetails?: boolean;
  isApplying?: boolean;
  onApplyChanges?: (changes: PracticeSessionChanges) => void;
};

/** Convert an ISO datetime string to an `HH:mm` value for `<input type="time">`. */
function isoToTimeInput(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** Apply a new HH:mm time to an existing ISO string, keeping the same date. */
function applyTimeToIso(baseIso: string, timeValue: string): string {
  const d = new Date(baseIso);
  const [h, m] = timeValue.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function assigneePageIdsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/**
 * Displays event details in a fixed overlay with an optional owner-only cancel
 * action and the event description when one is available.
 */
export default function EventDetailsModal({
  isOpen,
  event,
  isCancelling,
  dismissOnBackdrop = false,
  onClose,
  onCancel,
  isAdmin = false,
  notionDetails = null,
  isLoadingNotionDetails = false,
  isApplying = false,
  onApplyChanges,
}: EventDetailsModalProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Admin draft state
  const [draftStartTime, setDraftStartTime] = useState<string | null>(null);
  const [draftEndTime, setDraftEndTime] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<string | null>(null);
  const [draftPatchlistLink, setDraftPatchlistLink] = useState<string | null>(
    null,
  );
  const [draftAssigneePageIds, setDraftAssigneePageIds] = useState<
    string[] | null
  >(null);

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

  // Reset draft state when modal opens/closes or the event changes
  useEffect(() => {
    setDraftStartTime(null);
    setDraftEndTime(null);
    setDraftStatus(null);
    setDraftPatchlistLink(null);
    setDraftAssigneePageIds(null);
  }, [event?.id, isOpen]);

  if (!isOpen || !event) {
    return null;
  }

  const isPractice = event.eventType === "practice";
  const isJam = event.eventType === "jam";
  const showAdminControls = isAdmin && isPractice;
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

  // Admin: compute effective (draft or original) values
  const origStartTime = isoToTimeInput(event.start);
  const origEndTime = isoToTimeInput(event.end);
  const effectiveStartTime = draftStartTime ?? origStartTime;
  const effectiveEndTime = draftEndTime ?? origEndTime;
  const effectiveStatus = draftStatus ?? notionDetails?.currentStatus ?? null;
  const originalStatus = notionDetails?.currentStatus ?? null;

  const timesChanged =
    effectiveStartTime !== origStartTime || effectiveEndTime !== origEndTime;
  const statusChanged = draftStatus !== null && draftStatus !== originalStatus;
  const originalPatchlistLink = notionDetails?.patchlistLink ?? null;
  const effectivePatchlistLink = draftPatchlistLink ?? originalPatchlistLink;
  const patchlistChanged =
    draftPatchlistLink !== null &&
    draftPatchlistLink !== (originalPatchlistLink ?? "");
  const originalAssigneePageIds = (notionDetails?.assignees ?? []).map(
    (a) => a.pageId,
  );
  const effectiveAssigneePageIds =
    draftAssigneePageIds ?? originalAssigneePageIds;
  const assigneesChanged =
    draftAssigneePageIds !== null &&
    !assigneePageIdsEqual(draftAssigneePageIds, originalAssigneePageIds);
  const isDirty =
    timesChanged || statusChanged || patchlistChanged || assigneesChanged;

  // Display times: use draft times when set, otherwise original
  const displayStart = timesChanged
    ? new Date(applyTimeToIso(event.start, effectiveStartTime))
    : start;
  const displayEnd = timesChanged
    ? new Date(applyTimeToIso(event.end, effectiveEndTime))
    : end;

  const MIN_GAP_MS = 30 * 60 * 1000;

  const timeRangeInvalid =
    timesChanged && displayEnd.getTime() - displayStart.getTime() < MIN_GAP_MS;

  function handleApply() {
    if (!isDirty || !onApplyChanges || !event?.googleEventId) return;
    if (timeRangeInvalid) return;

    const changes: PracticeSessionChanges = {
      googleEventId: event.googleEventId,
    };

    if (timesChanged) {
      changes.newStart = applyTimeToIso(event.start, effectiveStartTime);
      changes.newEnd = applyTimeToIso(event.end, effectiveEndTime);
    }

    if (statusChanged && draftStatus) {
      changes.newStatus = draftStatus;
    }

    if (patchlistChanged) {
      changes.newPatchlistLink = draftPatchlistLink ?? "";
    }

    if (assigneesChanged) {
      changes.newAssigneePageIds = [...(draftAssigneePageIds ?? [])];
    }

    onApplyChanges(changes);
  }

  // Dot color: for admin practice events use effective status color
  const dotColor = showAdminControls
    ? getStatusColor(effectiveStatus)
    : undefined;

  const busyState = isCancelling || isApplying;

  return (
    <div
      data-blocking-app-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => {
        if (!dismissOnBackdrop || busyState) return;
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchStart={(e) => {
        if (!dismissOnBackdrop || busyState) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-3xl border border-neutral-800 bg-[#121212] p-6 text-white shadow-2xl">
        {/* Title row: items-start keeps the Notion control top-right when the title wraps */}
        <div className="mb-3 -ml-0.5 flex items-start gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-1">
            {showAdminControls ? (
              <PracticeStatusDropdown
                currentStatus={effectiveStatus}
                onSelect={(name) => setDraftStatus(name)}
                disabled={isLoadingNotionDetails || !notionDetails?.notionPageId}
              />
            ) : (
              <span
                className={`mt-1.5 inline-block h-3 w-3 shrink-0 rounded-full ${
                  isJam ? "bg-[#3f56c9]" : "bg-neutral-500"
                }`}
                style={dotColor ? { backgroundColor: dotColor } : undefined}
              />
            )}
            <h2 className="min-w-0 flex-1 break-words text-xl font-semibold leading-snug text-white">
              {headlineTitle}
            </h2>
          </div>

          {/* Notion icon button (admin + practice only) */}
          {showAdminControls && (
            <NotionLinkButton
              url={notionDetails?.notionPageUrl ?? null}
              loading={isLoadingNotionDetails}
            />
          )}
        </div>

        {/* Time range and attendee info */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {sessionAttendeeCount != null ? (
            <span
              role="status"
              aria-label={`Session attendees: ${sessionAttendeeCount}`}
              className={`inline-flex shrink-0 items-center rounded-full px-2 py-1 text-xs leading-none font-medium ${sessionAttendeePillClass(
                sessionAttendeeCount,
              )}`}
            >
              Session attendees: {sessionAttendeeCount}
            </span>
          ) : null}
          {showAdminControls ? (
            <PatchlistLinkInline
              value={effectivePatchlistLink}
              loading={isLoadingNotionDetails}
              disabled={busyState}
              onChange={(v) => setDraftPatchlistLink(v)}
            />
          ) : (
            <p className="min-w-0 text-xs text-neutral-300">
              {formatEventModalDateRange(displayStart, displayEnd)}
            </p>
          )}
        </div>

        {/* Admin time editing (practice only) */}
        {showAdminControls && (
          <div className="mt-4 flex w-full min-w-0 items-center gap-7">
            <div className="flex shrink-0 items-center gap-2">
              <TimePicker
                value={effectiveStartTime}
                onChange={(v) => setDraftStartTime(v)}
                disabled={busyState}
                error={
                  timeRangeInvalid
                    ? "Must be at least 30 min before end time."
                    : null
                }
              />
              <span className="shrink-0 text-neutral-500">→</span>
              <TimePicker
                value={effectiveEndTime}
                onChange={(v) => setDraftEndTime(v)}
                disabled={busyState}
                error={
                  timeRangeInvalid
                    ? "Must be at least 30 min after start time."
                    : null
                }
              />
            </div>
            <div className="min-w-0 flex-1">
              <PracticeAssigneePicker
                className="w-full"
                selectedPageIds={effectiveAssigneePageIds}
                onChange={(ids) => setDraftAssigneePageIds(ids)}
                resolvedSummaries={notionDetails?.assignees ?? []}
                disabled={busyState}
                loadingDetails={
                  isLoadingNotionDetails || !notionDetails?.notionPageId
                }
              />
            </div>
          </div>
        )}

        {rawDescription ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
            {detailsSectionTitle ? (
              <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
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

        {/* Bottom buttons */}
        <div className="mt-6 flex gap-3">
          {canShowCancelButton ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={busyState}
              className="flex-1 rounded-xl bg-red-500 px-4 py-2 font-medium text-white disabled:opacity-60"
            >
              {isCancelling
                ? "Cancelling..."
                : isJam
                  ? "Cancel reservation"
                  : "Cancel booking"}
            </button>
          ) : null}

          {showAdminControls && isDirty ? (
            <button
              type="button"
              onClick={handleApply}
              disabled={busyState || timeRangeInvalid}
              className="flex-1 rounded-xl bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
            >
              {isApplying ? "Applying..." : "Apply Changes"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              disabled={busyState}
              className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 font-medium text-neutral-200 disabled:opacity-60"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Small Notion "N" icon button that opens the linked page in a new tab. */
function NotionLinkButton({
  url,
  loading,
}: {
  url: string | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 animate-pulse items-center justify-center rounded-md bg-neutral-700" />
    );
  }

  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title="Open in Notion"
      className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 transition-colors hover:border-neutral-500 hover:bg-neutral-700"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M6.017 4.313l55.333-4.087c6.797-.583 8.543-.19 12.817 2.917l17.663 12.443c2.913 2.14 3.883 2.723 3.883 5.053v68.243c0 4.277-1.553 6.807-6.99 7.193L24.467 99.967c-4.08.193-6.023-.39-8.16-3.113L3.3 79.94c-2.333-3.113-3.3-5.443-3.3-8.167V11.113c0-3.497 1.553-6.413 6.017-6.8z"
          fill="currentColor"
        />
        <path
          d="M61.35.227l-55.333 4.087C1.553 4.7 0 7.617 0 11.113v60.66c0 2.723.967 5.053 3.3 8.167l12.813 16.913c2.137 2.723 4.08 3.307 8.16 3.113L88.723 96.08c5.437-.387 6.99-2.917 6.99-7.193V20.64c0-2.21-.81-2.893-3.443-4.733L74.167 3.143C69.893.04 68.147-.357 61.35.227zM25.723 19.01c-5.163.39-6.35.477-9.3-1.947L8.927 10.917c-.78-.78-.39-1.75 1.553-1.947l51.053-3.693c4.47-.387 6.797 1.167 8.543 2.527l9.107 6.607c.39.193 1.36 1.36.193 1.36l-52.867 3.043-.787.193z"
          fill="currentColor"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M19.803 88.3V30.367c0-2.53.78-3.697 3.113-3.89l56.887-3.3c2.14-.193 3.107 1.167 3.107 3.693V84.81c0 2.53-.39 4.67-3.883 4.863l-54.36 3.107c-3.5.193-4.863-1.007-4.863-4.48zm55.14-55.14c.39 1.553 0 3.107-1.553 3.3l-2.72.58v40.25c-2.333 1.167-4.47 1.75-6.217 1.75-2.913 0-3.69-.97-5.83-3.5L40.49 47.527v25.667l5.83 1.363s0 3.107-4.277 3.107l-11.83.58c-.39-.78 0-1.947 1.007-2.14l3.107-.78V38.34l-4.277-.39c-.39-1.553.583-3.89 3.107-4.08l12.613-.78L65.667 61.31V37.56l-4.857-.58c-.39-1.943 1.007-3.307 2.917-3.5l12.017-.31z"
          fill="#262626"
        />
      </svg>
    </a>
  );
}

/** Compact a URL for display: show hostname + truncated path. */
function compactUrl(url: string, maxLen = 32): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname + parsed.search + parsed.hash;
    const full = host + path;
    if (full.length <= maxLen) return full;
    const half = Math.floor((maxLen - 3) / 2);
    return full.slice(0, half) + "..." + full.slice(-half);
  } catch {
    if (url.length <= maxLen) return url;
    const half = Math.floor((maxLen - 3) / 2);
    return url.slice(0, half) + "..." + url.slice(-half);
  }
}

/**
 * Inline patchlist link display + popup editor.
 * Shows a compacted URL preview; clicking opens an expansion to edit.
 */
function PatchlistLinkInline({
  value,
  loading,
  disabled,
  onChange,
}: {
  value: string | null;
  loading: boolean;
  disabled: boolean;
  onChange: (url: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setInputValue(value ?? "");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editing, value]);

  useEffect(() => {
    if (!editing) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onChange(inputValue);
        setEditing(false);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setEditing(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [editing, inputValue, onChange]);

  if (loading) {
    return (
      <div className="relative min-w-0 flex-1">
        <span className="inline-block h-4 w-24 animate-pulse rounded bg-neutral-700" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      {editing ? (
        <div className="absolute left-0 top-full z-[60] mt-1 w-72 rounded-xl border border-neutral-700 bg-[#1a1a1a] p-3 shadow-2xl">
          <label className="mb-1 block text-[11px] font-medium text-neutral-400">
            Link to Patchlist
          </label>
          <input
            ref={inputRef}
            type="url"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onChange(inputValue);
                setEditing(false);
              }
            }}
            placeholder="Paste URL..."
            className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <p className="mt-1.5 break-all text-[11px] leading-snug text-neutral-500">
            {inputValue || "No link set"}
          </p>
        </div>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!editing) setEditing(true);
        }}
        title={value ?? "Add patchlist link"}
        className={
          editing
            ? "inline-flex min-w-0 items-center gap-1 text-xs text-blue-400"
            : "inline-flex min-w-0 items-center gap-1 text-xs text-neutral-400 transition-colors hover:text-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        <LinkIcon />
        <span
          className={
            editing
              ? "underline"
              : "truncate underline decoration-neutral-600 hover:decoration-blue-400"
          }
        >
          {value ? compactUrl(value) : "Add patchlist link"}
        </span>
      </button>
    </div>
  );
}

function LinkIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
