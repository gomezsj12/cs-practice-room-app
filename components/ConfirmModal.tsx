"use client";

/**
 * @module ConfirmModal
 *
 * Generic two-button confirmation dialog used for destructive actions such as
 * removing a calendar booking. The modal renders as a fixed overlay with a
 * customisable title, message, button labels, and loading state.
 *
 * Backdrop dismissal is opt-in via `dismissOnBackdrop` (enabled on mobile).
 *
 * @see CalendarView — uses this modal for calendar cancellation confirmation
 */

type ConfirmModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  dismissOnBackdrop?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** When set, backdrop taps call this instead of `onCancel` (e.g. suppress calendar click-through). */
  onBackdropDismiss?: () => void;
};

/**
 * Renders a confirm/cancel dialog overlay.
 *
 * @param props.isOpen - Controls visibility; renders `null` when closed.
 * @param props.title - Heading text displayed at the top of the dialog.
 * @param props.message - Explanatory body text.
 * @param props.confirmLabel - Label for the destructive/confirm button (default `"Confirm"`).
 * @param props.cancelLabel - Label for the safe/cancel button (default `"Cancel"`).
 * @param props.isLoading - Disables both buttons and shows a loading label on confirm.
 * @param props.dismissOnBackdrop - When `true`, tapping the backdrop dismisses the dialog.
 * @param props.onCancel - Callback when the cancel button is activated.
 * @param props.onConfirm - Callback when the confirm button is activated.
 * @param props.onBackdropDismiss - When `dismissOnBackdrop` and set, backdrop taps call this instead of `onCancel`.
 */
export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isLoading = false,
  dismissOnBackdrop = false,
  onCancel,
  onConfirm,
  onBackdropDismiss,
}: ConfirmModalProps) {
  if (!isOpen) {
    return null;
  }

  function dismissFromBackdrop() {
    if (onBackdropDismiss) {
      onBackdropDismiss();
    } else {
      onCancel();
    }
  }

  return (
    <div
      data-blocking-app-modal
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => {
        if (!dismissOnBackdrop) {
          return;
        }
        if (e.target === e.currentTarget) {
          dismissFromBackdrop();
        }
      }}
      onTouchStart={(e) => {
        if (!dismissOnBackdrop) {
          return;
        }
        if (e.target === e.currentTarget) {
          dismissFromBackdrop();
        }
      }}
    >
      <div className="w-full max-w-md rounded-3xl border border-neutral-800 bg-[#121212] p-6 text-white shadow-2xl">
        <h2 className="text-xl font-semibold text-white">{title}</h2>

        <p className="mt-3 text-sm text-neutral-300">{message}</p>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 font-medium text-neutral-200 disabled:opacity-60"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 rounded-xl bg-red-500 px-4 py-2 font-medium text-white disabled:opacity-60"
          >
            {isLoading ? "Cancelling..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}