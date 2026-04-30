"use client";

import {
  ADMIN_EVENT_TAG_OPTIONS,
  getAdminEventTagOption,
  type AdminEventTagKey,
} from "@/lib/admin-event-tags";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

type AdminEventTagSelectProps = {
  value: AdminEventTagKey | null;
  disabled?: boolean;
  onChange: (value: AdminEventTagKey | null) => void;
};

export default function AdminEventTagSelect({
  value,
  disabled = false,
  onChange,
}: AdminEventTagSelectProps) {
  const selectedOption = getAdminEventTagOption(value);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
            Private Calendar Tag
          </p>
          <p className="text-xs text-neutral-500">
            Only visible on your admin calendar.
          </p>
        </div>
        <span
          aria-hidden
          className="mt-1 inline-flex h-3.5 w-3.5 shrink-0 rounded-full border border-white/10"
          style={{
            backgroundColor: selectedOption?.color ?? "rgba(255,255,255,0.14)",
          }}
        />
      </div>

      <div className="mt-3">
        <Select
          value={value ?? "none"}
          onValueChange={(next) =>
            onChange(next === "none" ? null : (next as AdminEventTagKey))
          }
          disabled={disabled}
        >
          <SelectTrigger
            aria-label="Private calendar tag"
            placeholder="No private tag"
            className="w-full border-white/10 bg-[#151515] text-sm text-white hover:bg-[#1a1a1a]"
          />
          <SelectContent className="border-white/10 bg-[#151515]">
            <SelectItem
              index={0}
              value="none"
              className="text-neutral-300"
            >
              No private tag
            </SelectItem>
            {ADMIN_EVENT_TAG_OPTIONS.map((option, index) => (
              <SelectItem
                key={option.value}
                index={index + 1}
                value={option.value}
                className="text-neutral-100"
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
