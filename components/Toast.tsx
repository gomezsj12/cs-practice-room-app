"use client";

/**
 * @module Toast
 *
 * Lightweight, fixed-position toast notification rendered at the bottom-right
 * of the viewport. Supports success, error, and info variants.
 *
 * Visibility is controlled externally via {@link ToastProps.isOpen}; the
 * component does not manage its own timers or auto-dismiss logic — that
 * responsibility lives in the {@link useToast} hook.
 *
 * @see useToast — hook that manages toast state and auto-dismiss timing
 */

type ToastProps = {
  isOpen: boolean;
  message: string;
  type: "success" | "error" | "info";
  onClose: () => void;
};

/**
 * Renders a dismissible toast notification in a fixed bottom-right position.
 *
 * @param props.isOpen - Whether the toast is visible.
 * @param props.message - Text content displayed in the toast body.
 * @param props.type - Visual variant: `"success"` (green), `"error"` (red), or `"info"` (slate).
 * @param props.onClose - Callback invoked when the user clicks the close button.
 */
export default function Toast({
  isOpen,
  message,
  type,
  onClose,
}: ToastProps) {
  if (!isOpen) {
    return null;
  }

  const styles = {
    success: "bg-emerald-500 text-slate-950",
    error: "bg-red-500 text-white",
    info: "bg-slate-700 text-white",
  };

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-full max-w-sm px-4 sm:px-0">
      <div
        className={`flex items-start justify-between gap-3 rounded-2xl px-4 py-3 shadow-2xl ${styles[type]}`}
      >
        <p className="text-sm font-medium">{message}</p>

        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-sm font-semibold opacity-80 hover:opacity-100"
        >
          Close
        </button>
      </div>
    </div>
  );
}