"use client";

/**
 * Material-style clock-face time picker for the admin practice session modal.
 * Two-phase selection: pick hour on a clock face, then pick minutes.
 * AM/PM toggle at the top. Dark-themed to match the modal.
 */

import { useCallback, useEffect, useRef, useState } from "react";

type TimePickerProps = {
  /** Current value in HH:mm (24-hour) format. */
  value: string;
  /** Called with the new HH:mm (24-hour) value. */
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Error message shown inside the dropdown when open. */
  error?: string | null;
};

type ClockMode = "hour" | "minute";

/** Convert 24h HH:mm to { hour12, minute, period }. */
function parse24(value: string): {
  hour12: number;
  minute: number;
  period: "AM" | "PM";
} {
  const [hStr, mStr] = value.split(":");
  let h24 = parseInt(hStr, 10);
  const rawMin = parseInt(mStr, 10);
  if (Number.isNaN(h24)) h24 = 12;
  if (Number.isNaN(rawMin)) return { hour12: 12, minute: 0, period: "PM" };

  const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;

  const minute = Math.round(rawMin / 5) * 5;
  return { hour12: h12, minute: minute >= 60 ? 55 : minute, period };
}

/** Convert { hour12, minute, period } back to 24h HH:mm. */
function to24(hour12: number, minute: number, period: "AM" | "PM"): string {
  let h24 = hour12 % 12;
  if (period === "PM") h24 += 12;
  return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Format 24h HH:mm for display as "h:mm AM/PM". */
export function formatTimeDisplay(value: string): string {
  const { hour12, minute, period } = parse24(value);
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

const CLOCK_RADIUS = 96;
const NUMBER_RADIUS = 72;
const CENTER = CLOCK_RADIUS;
const HAND_TARGET_RADIUS = 18;

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTE_MARKS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function getPosition(value: number, total: number) {
  const angle = ((value % total) / total) * 2 * Math.PI - Math.PI / 2;
  return {
    x: CENTER + NUMBER_RADIUS * Math.cos(angle),
    y: CENTER + NUMBER_RADIUS * Math.sin(angle),
  };
}

function getHandAngle(value: number, total: number): number {
  return ((value % total) / total) * 360 - 90;
}

function ClockFace({
  mode,
  hour,
  minute,
  onSelectHour,
  onSelectMinute,
}: {
  mode: ClockMode;
  hour: number;
  minute: number;
  onSelectHour: (h: number) => void;
  onSelectMinute: (m: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const isDragging = useRef(false);

  const getValueFromPoint = useCallback(
    (clientX: number, clientY: number): number | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const x = clientX - rect.left - CENTER;
      const y = clientY - rect.top - CENTER;
      let angle = Math.atan2(y, x) + Math.PI / 2;
      if (angle < 0) angle += 2 * Math.PI;
      const fraction = angle / (2 * Math.PI);

      if (mode === "hour") {
        let h = Math.round(fraction * 12);
        if (h === 0) h = 12;
        return h;
      } else {
        let m = Math.round(fraction * 12) * 5;
        if (m === 60) m = 0;
        return m;
      }
    },
    [mode],
  );

  const handlePointerEvent = useCallback(
    (clientX: number, clientY: number) => {
      const val = getValueFromPoint(clientX, clientY);
      if (val === null) return;
      if (mode === "hour") {
        onSelectHour(val);
      } else {
        onSelectMinute(val);
      }
    },
    [mode, getValueFromPoint, onSelectHour, onSelectMinute],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      isDragging.current = true;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      handlePointerEvent(e.clientX, e.clientY);
    },
    [handlePointerEvent],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      handlePointerEvent(e.clientX, e.clientY);
    },
    [handlePointerEvent],
  );

  const onPointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const items = mode === "hour" ? HOURS : MINUTE_MARKS;
  const selectedValue = mode === "hour" ? hour : minute;
  const total = mode === "hour" ? 12 : 60;

  const handAngle = getHandAngle(selectedValue, total);

  const selectedPos = getPosition(
    mode === "hour"
      ? selectedValue
      : selectedValue / 5,
    12,
  );

  return (
    <svg
      ref={svgRef}
      width={CLOCK_RADIUS * 2}
      height={CLOCK_RADIUS * 2}
      className="cursor-pointer touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Background circle */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={CLOCK_RADIUS - 2}
        fill="#1e1e1e"
        stroke="#333"
        strokeWidth="1"
      />

      {/* Clock hand line */}
      <line
        x1={CENTER}
        y1={CENTER}
        x2={selectedPos.x}
        y2={selectedPos.y}
        stroke="#3b82f6"
        strokeWidth="2"
      />

      {/* Center dot */}
      <circle cx={CENTER} cy={CENTER} r={4} fill="#3b82f6" />

      {/* Selected value circle at end of hand */}
      <circle
        cx={selectedPos.x}
        cy={selectedPos.y}
        r={HAND_TARGET_RADIUS}
        fill="#3b82f6"
      />

      {/* Number labels */}
      {items.map((val, i) => {
        const pos = getPosition(i, 12);
        const isSelected = val === selectedValue;
        return (
          <text
            key={val}
            x={pos.x}
            y={pos.y}
            textAnchor="middle"
            dominantBaseline="central"
            className="pointer-events-none select-none"
            fill={isSelected ? "#fff" : "#999"}
            fontWeight={isSelected ? 600 : 400}
            fontSize="13"
          >
            {mode === "minute"
              ? String(val).padStart(2, "0")
              : val}
          </text>
        );
      })}
    </svg>
  );
}

export default function TimePicker({
  value,
  onChange,
  disabled = false,
  error = null,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ClockMode>("hour");
  const containerRef = useRef<HTMLDivElement>(null);
  const valueOnOpenRef = useRef<string>(value);
  const parsed = parse24(value);

  const [draftHour, setDraftHour] = useState(parsed.hour12);
  const [draftMinute, setDraftMinute] = useState(parsed.minute);
  const [draftPeriod, setDraftPeriod] = useState(parsed.period);

  const toggle = useCallback(() => {
    if (!disabled) {
      setOpen((p) => {
        if (!p) {
          valueOnOpenRef.current = value;
          const fresh = parse24(value);
          setDraftHour(fresh.hour12);
          setDraftMinute(fresh.minute);
          setDraftPeriod(fresh.period);
          setMode("hour");
        }
        return !p;
      });
    }
  }, [disabled, value]);

  const hasError = Boolean(error);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (hasError) return;
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
        onChange(valueOnOpenRef.current);
        const restored = parse24(valueOnOpenRef.current);
        setDraftHour(restored.hour12);
        setDraftMinute(restored.minute);
        setDraftPeriod(restored.period);
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [open, hasError, onChange]);

  function handleSelectHour(h: number) {
    setDraftHour(h);
    onChange(to24(h, draftMinute, draftPeriod));
    setTimeout(() => setMode("minute"), 200);
  }

  function handleSelectMinute(m: number) {
    setDraftMinute(m);
    onChange(to24(draftHour, m, draftPeriod));
  }

  function handlePeriodChange(p: "AM" | "PM") {
    setDraftPeriod(p);
    onChange(to24(draftHour, draftMinute, p));
  }

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
          open
            ? "border-blue-500 bg-neutral-800 text-white"
            : "border-neutral-700 bg-neutral-800 text-white hover:border-neutral-500"
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span>{formatTimeDisplay(value)}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-neutral-400"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[60] mt-2 rounded-2xl border border-neutral-700 bg-[#141414] p-4 shadow-2xl sm:left-1/2 sm:-translate-x-1/2">
          {/* Header: time display + AM/PM */}
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-0.5 text-xl font-semibold text-white">
              <button
                type="button"
                onClick={() => setMode("hour")}
                className={`rounded px-1 transition-colors ${
                  mode === "hour"
                    ? "text-blue-400"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {draftHour}
              </button>
              <span className="text-neutral-500">:</span>
              <button
                type="button"
                onClick={() => setMode("minute")}
                className={`rounded px-1 transition-colors ${
                  mode === "minute"
                    ? "text-blue-400"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {String(draftMinute).padStart(2, "0")}
              </button>
            </div>

            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => handlePeriodChange("AM")}
                className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors ${
                  draftPeriod === "AM"
                    ? "bg-blue-600/30 text-blue-300"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                AM
              </button>
              <button
                type="button"
                onClick={() => handlePeriodChange("PM")}
                className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors ${
                  draftPeriod === "PM"
                    ? "bg-blue-600/30 text-blue-300"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                PM
              </button>
            </div>
          </div>

          {/* Clock face */}
          <ClockFace
            mode={mode}
            hour={draftHour}
            minute={draftMinute}
            onSelectHour={handleSelectHour}
            onSelectMinute={handleSelectMinute}
          />

          {error && (
            <p className="mt-2 max-w-[192px] text-center text-[11px] leading-tight text-red-400">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => { if (!hasError) setOpen(false); }}
            disabled={hasError}
            className="mt-3 w-full rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
