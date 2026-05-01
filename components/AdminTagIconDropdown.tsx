"use client";

/**
 * Compact icon-only tag picker for admin calendar event tags.
 *
 * Renders a bare Tag icon (colored when active, grey when inactive) that
 * opens a small horizontal dropdown of Tag icons in each available color.
 * Replaces the previous card-style {@link AdminEventTagSelect}.
 */

import { useEffect, useRef, useState } from "react";
import { Tag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ADMIN_EVENT_TAG_OPTIONS,
  getAdminEventTagOption,
  type AdminEventTagKey,
} from "@/lib/admin-event-tags";

const springs = {
  fast: { type: "spring" as const, duration: 0.08, bounce: 0 },
};

type AdminTagIconDropdownProps = {
  value: AdminEventTagKey | null;
  disabled?: boolean;
  onChange: (value: AdminEventTagKey | null) => void;
};

export default function AdminTagIconDropdown({
  value,
  disabled = false,
  onChange,
}: AdminTagIconDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption = getAdminEventTagOption(value);

  // Close on click-outside
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [open]);

  function handleSelect(tagKey: AdminEventTagKey | null) {
    onChange(tagKey);
    setOpen(false);
  }

  return (
    <div
      ref={containerRef}
      className="relative inline-flex shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Trigger: bare Tag icon */}
      <button
        type="button"
        aria-label="Private calendar tag"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="group mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center transition-all disabled:opacity-50"
      >
        <Tag
          size={18}
          strokeWidth={1.8}
          className="transition-all group-hover:scale-110 group-hover:brightness-125"
          style={{
            color: selectedOption?.color ?? "rgba(163, 163, 163, 0.6)",
          }}
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute right-0 top-full z-[70] mt-1.5 rounded-xl border border-neutral-700/60 bg-[#1a1a1a]/95 p-1.5 shadow-xl backdrop-blur-sm"
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={springs.fast}
            style={{ transformOrigin: "top right" }}
          >
            <div className="flex items-center gap-0.5">
              {/* "No tag" option */}
              <button
                type="button"
                aria-label="No tag"
                onClick={() => handleSelect(null)}
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
              >
                <Tag
                  size={17}
                  strokeWidth={1.8}
                  style={{ color: "rgba(163, 163, 163, 0.5)" }}
                />
                {value === null && <SelectedDot color="rgba(163, 163, 163, 0.6)" />}
              </button>

              {/* Separator */}
              <div className="mx-0.5 h-5 w-px bg-neutral-700/60" />

              {/* Color options */}
              {ADMIN_EVENT_TAG_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-label={`Tag: ${option.label}`}
                  onClick={() => handleSelect(option.value)}
                  className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
                >
                  <Tag
                    size={17}
                    strokeWidth={1.8}
                    style={{ color: option.color }}
                  />
                  {value === option.value && <SelectedDot color={option.color} />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Small dot indicator below the selected tag icon. */
function SelectedDot({ color }: { color: string }) {
  return (
    <span
      className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}
