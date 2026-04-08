"use client";

type ToastProps = {
  isOpen: boolean;
  message: string;
  type: "success" | "error" | "info";
  onClose: () => void;
};

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