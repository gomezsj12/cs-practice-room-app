import { useCallback, useEffect, useState } from "react";
import type { ToastState } from "@/lib/types";

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
