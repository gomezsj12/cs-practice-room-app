"use client";

/**
 * Notion-style grouped status dropdown for admin practice session editing.
 * Rendered inline within the EventDetailsModal title row.
 *
 * @see lib/practice-session-status.ts — status options, colors, groups
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getStatusColor,
  PRACTICE_SESSION_STATUSES,
} from "@/lib/practice-session-status";

type PracticeStatusDropdownProps = {
  currentStatus: string | null;
  onSelect: (statusName: string) => void;
  disabled?: boolean;
};

type StatusGroup = {
  label: string | null;
  items: typeof PRACTICE_SESSION_STATUSES;
};

function groupStatuses(): StatusGroup[] {
  const groups: StatusGroup[] = [];
  const seen = new Set<string | null>();

  for (const s of PRACTICE_SESSION_STATUSES) {
    if (!seen.has(s.group)) {
      seen.add(s.group);
      groups.push({
        label: s.group,
        items: PRACTICE_SESSION_STATUSES.filter((x) => x.group === s.group),
      });
    }
  }

  return groups;
}

const STATUS_GROUPS = groupStatuses();

export default function PracticeStatusDropdown({
  currentStatus,
  onSelect,
  disabled = false,
}: PracticeStatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => {
    if (!disabled) setOpen((prev) => !prev);
  }, [disabled]);

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

  const dotColor = getStatusColor(currentStatus);

  return (
    <div ref={containerRef} className="relative mt-px inline-flex shrink-0">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        title={disabled ? "No Notion page linked" : `Status: ${currentStatus ?? "Unknown"}`}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
          disabled
            ? "cursor-not-allowed opacity-40"
            : "cursor-pointer"
        }`}
      >
        <span
          className="inline-block h-4 w-4 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[60] mt-1 min-w-[240px] rounded-xl border border-neutral-700 bg-[#1a1a1a] py-1 shadow-xl">
          {STATUS_GROUPS.map((group, gi) => (
            <div key={group.label ?? "_ungrouped"}>
              {gi > 0 && (
                <div className="mx-2 my-1 border-t border-neutral-700/60" />
              )}
              {group.label && (
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                  {group.label}
                </p>
              )}
              {group.items.map((status) => {
                const isActive = currentStatus === status.name;
                return (
                  <button
                    key={status.name}
                    type="button"
                    onClick={() => {
                      onSelect(status.name);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors ${
                      isActive
                        ? "bg-white/10 text-white"
                        : "text-neutral-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: status.color }}
                    />
                    <span className="truncate">{status.name}</span>
                    {isActive && (
                      <span className="ml-auto text-xs text-neutral-400">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
