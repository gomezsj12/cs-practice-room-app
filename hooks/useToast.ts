/**
 * @file Self-dismissing toast notification hook.
 *
 * Provides a `showToast` / `closeToast` API backed by a single
 * {@link ToastState} value.  Toasts auto-dismiss after 3.5 s, and the
 * timer resets if a new toast is shown before the previous one expires.
 *
 * Consumed by the top-level calendar page and threaded down to child
 * components (booking flow, drag-select, event polling) via props.
 *
 * @see {@link ToastState} in `lib/types` for the shape of the state.
 */
import { useCallback, useEffect, useState } from "react";
import type { ToastState } from "@/lib/types";

/**
 * Manages a single toast notification with automatic dismissal.
 *
 * @returns `toast` – current toast state for rendering;
 *          `showToast` – open a toast with a message and severity;
 *          `closeToast` – dismiss the active toast immediately.
 */
export function useToast() {
  const [toast, setToast] = useState<ToastState>({
    isOpen: false,
    message: "",
    type: "info",
  });

  const showToast = useCallback(
    (message: string, type: "success" | "error" | "info" = "info") => {
      setToast({
        isOpen: true,
        message,
        type,
      });
    },
    [],
  );

  // Uses a functional update so the message/type are preserved during the
  // fade-out animation; only `isOpen` flips to false.
  const closeToast = useCallback(() => {
    setToast((currentToast) => ({
      ...currentToast,
      isOpen: false,
    }));
  }, []);

  useEffect(() => {
    if (!toast.isOpen) {
      return;
    }

    const timeout = window.setTimeout(() => {
      closeToast();
    }, 3500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [toast.isOpen, closeToast]);

  return { toast, showToast, closeToast };
}
