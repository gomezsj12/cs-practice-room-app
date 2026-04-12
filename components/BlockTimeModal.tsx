"use client";

/**
 * @module BlockTimeModal
 *
 * Simple confirmation modal shown to admins after drag-selecting a time
 * range on the calendar. Displays the selected time range and a title
 * field (defaulting to "Practice Room Closed"), then submits the block
 * via the parent's callback.
 */

import { useState } from "react";
import { formatBookingDateRange } from "@/lib/formatting";

type BlockTimeModalProps = {
  isOpen: boolean;
  start: Date | null;
  end: Date | null;
  isSubmitting: boolean;
  dismissOnBackdrop?: boolean;
  onClose: () => void;
  onSubmit: (values: { title: string }) => void;
};

export default function BlockTimeModal({
  isOpen,
  start,
  end,
  isSubmitting,
  dismissOnBackdrop = false,
  onClose,
  onSubmit,
}: BlockTimeModalProps) {
  const [title, setTitle] = useState("Practice Room Closed");

  if (!isOpen || !start || !end) {
    return null;
  }

  const formattedRange = formatBookingDateRange(start, end);

  return (
    <div
      data-blocking-app-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => {
        if (!dismissOnBackdrop || isSubmitting) return;
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchStart={(e) => {
        if (!dismissOnBackdrop || isSubmitting) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-3xl border border-neutral-800 bg-[#121212] p-6 text-white shadow-2xl">
        <h2 className="text-xl font-semibold text-white">
          Block off time
        </h2>

        <p className="mt-2 text-sm text-neutral-300">{formattedRange}</p>

        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <p className="text-sm font-medium text-red-200">
            Admin action
          </p>
          <p className="mt-1 text-sm text-red-100/80">
            This will create a &ldquo;blocked off&rdquo; overlay on both
            calendars, preventing anyone from booking this time.
          </p>
        </div>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ title: title.trim() || "Practice Room Closed" });
          }}
        >
          <div>
            <label
              htmlFor="block-title"
              className="mb-1 block text-sm font-medium text-neutral-200"
            >
              Label
            </label>
            <input
              id="block-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-xl border border-neutral-700 bg-[#1a1a1a] px-3 py-2 text-white outline-none focus:border-red-500 disabled:opacity-60"
              placeholder="Practice Room Closed"
            />
          </div>

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
              disabled={isSubmitting}
              className="flex-1 rounded-xl bg-red-500 px-4 py-2 font-medium text-white disabled:opacity-60"
            >
              {isSubmitting ? "Creating..." : "Block off"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
