"use client";

/**
 * Notion-style multi-select for practice **Assignee(s)** (People directory).
 * Loads the full directory once when the popover opens; search filters client-side.
 * Reorder uses pointer events + a full-row ghost (vertical-only), not HTML5 DnD.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { notionTypeVisualForLabel } from "@/lib/notion-assignee-type-styles";
import { NOTION_VERIFY_ROSETTE_PATH } from "@/lib/notion-verify-rosette";
import type { PracticeAssigneeSummary } from "@/lib/types";

/** Dark checkmark on colored rosette (Notion-style). */
const VERIFY_CHECK_STROKE = "#141414";

/** Tiny dead band at row midline to avoid flip-flop when Y is exactly centered. */
const MIDLINE_HYSTERESIS_PX = 2;
/** Vertically extend each row’s hit box (px) so gaps and row centers feel easier to target. */
const ROW_HIT_INFLATE_PX = 10;

/** Selected-row layout: ghost row must match `li` so the grip column never shifts. */
const SELECTED_ROW_CLASS = "flex items-center gap-1.5 rounded-lg px-1 py-1";
const GRIP_COLUMN_CLASS =
  "flex h-7 w-7 shrink-0 cursor-grab touch-none items-center justify-center text-neutral-500 active:cursor-grabbing";
const REMOVE_COLUMN_CLASS =
  "flex h-7 w-7 shrink-0 items-center justify-center";

function summaryKey(s: PracticeAssigneeSummary): string {
  return s.pageId;
}

function arraysShallowEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/** Six-dot reorder grip (Notion-style). */
function ReorderGrip() {
  return (
    <span
      className="grid shrink-0 cursor-grab touch-manipulation grid-cols-2 gap-0.5 px-0.5 active:cursor-grabbing"
      aria-hidden
    >
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className="h-1 w-1 rounded-full bg-neutral-500" />
      ))}
    </span>
  );
}

function NotionVerifyBadge({
  type,
  size = "md",
  rosetteFillOpacity = 1,
}: {
  type: string | null;
  size?: "md" | "sm";
  /** Optional rosette fill opacity (1 = solid; stacked trigger uses ~0.9). */
  rosetteFillOpacity?: number;
}) {
  const { verifyFill } = notionTypeVisualForLabel(type);
  const px = size === "sm" ? 22 : 28;
  const box = size === "sm" ? "h-[22px] w-[22px]" : "h-7 w-7";
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center ${box}`}
      aria-hidden
    >
      <svg width={px} height={px} viewBox="0 0 32 32" className="block">
        <path
          d={NOTION_VERIFY_ROSETTE_PATH}
          fill={verifyFill}
          fillOpacity={rosetteFillOpacity}
        />
        <path
          d="M12 16.5 L15 19.05 L19.45 14.25"
          fill="none"
          stroke={VERIFY_CHECK_STROKE}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** Rebuild order: move `draggedId` to before/after `targetId` in `preview`. */
function insertDraggedRelativeToTarget(
  preview: string[],
  draggedId: string,
  targetId: string,
  insertBeforeTarget: boolean,
): string[] {
  if (draggedId === targetId) return preview;
  const from = preview.indexOf(draggedId);
  if (from < 0) return preview;
  const without = preview.filter((id) => id !== draggedId);
  let insert = without.indexOf(targetId);
  if (insert < 0) return preview;
  if (!insertBeforeTarget) insert += 1;
  insert = Math.max(0, Math.min(insert, without.length));
  const next = [...without];
  next.splice(insert, 0, draggedId);
  return next;
}

/**
 * Pick which row the pointer refers to, and whether to insert before/after its midline.
 * Inflated vertical hit targets make gaps between rows easier to “catch”.
 */
function hitFromClientY(
  clientY: number,
  rows: HTMLElement[],
): { targetId: string; before: boolean } | null {
  if (rows.length === 0) return null;

  type Cand = { id: string; mid: number; tightTop: number; tightBottom: number };
  const cands: Cand[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].getBoundingClientRect();
    const id = rows[i].dataset.pageId;
    if (!id) continue;
    const mid = r.top + r.height / 2;
    const top = r.top - ROW_HIT_INFLATE_PX;
    const bottom = r.bottom + ROW_HIT_INFLATE_PX;
    if (clientY >= top && clientY <= bottom) {
      cands.push({ id, mid, tightTop: r.top, tightBottom: r.bottom });
    }
  }

  let chosen: Cand | null = null;
  if (cands.length === 0) {
    let idx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      const mid = r.top + r.height / 2;
      const d = Math.abs(clientY - mid);
      if (d < bestDist) {
        bestDist = d;
        idx = i;
      }
    }
    const r = rows[idx].getBoundingClientRect();
    const id = rows[idx].dataset.pageId;
    if (!id) return null;
    const mid = r.top + r.height / 2;
    if (Math.abs(clientY - mid) < MIDLINE_HYSTERESIS_PX) return null;
    return { targetId: id, before: clientY < mid };
  }

  let best = Infinity;
  for (const c of cands) {
    const d = Math.abs(clientY - c.mid);
    if (d < best) {
      best = d;
      chosen = c;
    }
  }

  if (!chosen) return null;

  const mid = chosen.mid;
  if (Math.abs(clientY - mid) < MIDLINE_HYSTERESIS_PX) return null;
  return { targetId: chosen.id, before: clientY < mid };
}

type PointerDragState = {
  pageId: string;
  pointerId: number;
  offsetY: number;
  anchorLeft: number;
  anchorWidth: number;
};

type PracticeAssigneePickerProps = {
  selectedPageIds: string[];
  onChange: (pageIds: string[]) => void;
  resolvedSummaries: PracticeAssigneeSummary[];
  disabled?: boolean;
  loadingDetails?: boolean;
  /** e.g. `w-full` so the trigger stretches in a flex row beside time pickers. */
  className?: string;
};

/** Max verify icons shown on the closed trigger before "+N" in the label. */
const TRIGGER_ICON_CAP = 6;

export default function PracticeAssigneePicker({
  selectedPageIds,
  onChange,
  resolvedSummaries,
  disabled = false,
  loadingDetails = false,
  className,
}: PracticeAssigneePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [people, setPeople] = useState<PracticeAssigneeSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingPeople, setIsLoadingPeople] = useState(false);

  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null);
  const previewOrderRef = useRef<string[] | null>(null);
  const [pointerDrag, setPointerDrag] = useState<PointerDragState | null>(null);
  const [ghostTop, setGhostTop] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const selectedBandRef = useRef<HTMLDivElement>(null);
  const selectedListRef = useRef<HTMLUListElement>(null);
  const fetchedRef = useRef(false);
  const displayOrderRef = useRef<string[]>([]);
  const lastHitKeyRef = useRef<string>("");
  const pointerCleanupRef = useRef<null | (() => void)>(null);

  const summaryById = useMemo(() => {
    const m = new Map<string, PracticeAssigneeSummary>();
    for (const s of resolvedSummaries) {
      m.set(s.pageId, s);
    }
    if (people) {
      for (const s of people) {
        m.set(s.pageId, s);
      }
    }
    return m;
  }, [resolvedSummaries, people]);

  const displayOrder = previewOrder ?? selectedPageIds;
  displayOrderRef.current = displayOrder;

  const displaySummaries = useMemo(
    () =>
      displayOrder.map((id) => {
        const hit = summaryById.get(id);
        if (hit) return hit;
        return {
          pageId: id,
          name: "…",
          type: null,
          icon: null,
        } satisfies PracticeAssigneeSummary;
      }),
    [displayOrder, summaryById],
  );

  const loadPeople = useCallback(async () => {
    if (fetchedRef.current) return;
    setIsLoadingPeople(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/notion/people-directory");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load people.");
      }
      const data = (await res.json()) as { people?: PracticeAssigneeSummary[] };
      setPeople(Array.isArray(data.people) ? data.people : []);
      fetchedRef.current = true;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load.");
      setPeople([]);
    } finally {
      setIsLoadingPeople(false);
    }
  }, []);

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

  useEffect(() => {
    if (open && !fetchedRef.current) {
      void loadPeople();
    }
  }, [open, loadPeople]);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const apply = () => setIsCoarsePointer(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  /** Abort in-progress pointer drag if the popover closes. */
  useEffect(() => {
    if (open) return;
    pointerCleanupRef.current?.();
    pointerCleanupRef.current = null;
    document.body.style.userSelect = "";
    previewOrderRef.current = null;
    lastHitKeyRef.current = "";
    setPointerDrag(null);
    setGhostTop(null);
    setPreviewOrder(null);
  }, [open]);

  const q = search.trim().toLowerCase();
  const available = useMemo(() => {
    const base = people ?? [];
    const selected = new Set(selectedPageIds);
    return base.filter((p) => {
      if (selected.has(p.pageId)) return false;
      if (!q) return true;
      const name = p.name.toLowerCase();
      const type = (p.type ?? "").toLowerCase();
      return name.includes(q) || type.includes(q);
    });
  }, [people, selectedPageIds, q]);

  function toggleOpen() {
    if (disabled || loadingDetails) return;
    setOpen((o) => !o);
    if (!open) setSearch("");
  }

  function addAssignee(id: string) {
    if (selectedPageIds.includes(id)) return;
    onChange([...selectedPageIds, id]);
  }

  function removeAssignee(id: string) {
    onChange(selectedPageIds.filter((x) => x !== id));
  }

  function endPointerDrag(commit: boolean) {
    pointerCleanupRef.current?.();
    pointerCleanupRef.current = null;
    document.body.style.userSelect = "";

    const finalOrder = previewOrderRef.current;
    if (commit && finalOrder && !arraysShallowEqual(finalOrder, selectedPageIds)) {
      onChange(finalOrder);
    }

    previewOrderRef.current = null;
    lastHitKeyRef.current = "";
    setPointerDrag(null);
    setGhostTop(null);
    setPreviewOrder(null);
  }

  function handleGripPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    summary: PracticeAssigneeSummary,
  ) {
    if (e.button !== 0 || disabled || loadingDetails) return;
    e.preventDefault();
    e.stopPropagation();

    const li = (e.currentTarget as HTMLElement).closest("[data-assignee-row]");
    if (!li || !selectedListRef.current) return;

    const rect = li.getBoundingClientRect();
    const startOrder = [...displayOrderRef.current];
    previewOrderRef.current = startOrder;
    setPreviewOrder(startOrder);
    lastHitKeyRef.current = "";

    const offsetY = e.clientY - rect.top;
    setPointerDrag({
      pageId: summary.pageId,
      pointerId: e.pointerId,
      offsetY,
      anchorLeft: rect.left,
      anchorWidth: rect.width,
    });
    setGhostTop(rect.top);
    document.body.style.userSelect = "none";

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      ev.preventDefault();
      const band = selectedBandRef.current?.getBoundingClientRect();
      const rawTop = ev.clientY - offsetY;
      const h = rect.height;
      const top =
        band != null
          ? Math.min(
              Math.max(rawTop, band.top),
              Math.max(band.top, band.bottom - h),
            )
          : rawTop;
      setGhostTop(top);

      const ul = selectedListRef.current;
      const prev = previewOrderRef.current;
      if (!ul || !prev) return;

      const rows = [
        ...ul.querySelectorAll<HTMLElement>("[data-assignee-row]"),
      ];
      const hit = hitFromClientY(ev.clientY, rows);
      if (!hit) return;

      const key = `${hit.targetId}:${hit.before ? "1" : "0"}`;
      if (key === lastHitKeyRef.current) return;
      lastHitKeyRef.current = key;

      const next = insertDraggedRelativeToTarget(
        prev,
        summary.pageId,
        hit.targetId,
        hit.before,
      );
      if (next.join("\0") === prev.join("\0")) return;
      previewOrderRef.current = next;
      setPreviewOrder(next);
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      endPointerDrag(true);
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    pointerCleanupRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }

  const ghostSummary =
    pointerDrag != null ? summaryById.get(pointerDrag.pageId) : undefined;

  const n = selectedPageIds.length;
  const triggerEmptyLabel = "No Assignees";
  /** Shown below `sm` when nothing is selected (compact trigger). */
  const triggerEmptyLabelMobile = "None";
  const visibleTriggerIds = selectedPageIds.slice(0, TRIGGER_ICON_CAP);
  const triggerSummaries = visibleTriggerIds.map((id) => {
    const hit = summaryById.get(id);
    return (
      hit ?? {
        pageId: id,
        name: "…",
        type: null,
        icon: null,
      }
    );
  });
  const triggerText =
    n === 1 ? "1 Assignee" : n > 1 ? `${n} assignees` : "";

  const iconStackCount = triggerSummaries.length;
  /** Symmetric horizontal padding: tightens equally when more icons need room. */
  const triggerPadX =
    n === 0
      ? "px-3"
      : iconStackCount <= 2
        ? "px-3"
        : iconStackCount === 3
          ? "px-2.5"
          : iconStackCount <= 5
            ? "px-2"
            : "px-1.5";

  const ghostPortal =
    pointerDrag != null &&
    ghostTop != null &&
    ghostSummary &&
    typeof document !== "undefined"
      ? createPortal(
          <div
            className={`pointer-events-none fixed z-[10000] ${SELECTED_ROW_CLASS} bg-neutral-800/55 shadow-2xl backdrop-blur-md`}
            style={{
              top: ghostTop,
              left: pointerDrag.anchorLeft,
              width: pointerDrag.anchorWidth,
              cursor: "grabbing",
            }}
          >
            <div className={GRIP_COLUMN_CLASS} aria-hidden>
              <ReorderGrip />
            </div>
            <NotionVerifyBadge type={ghostSummary.type} />
            <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-snug text-white">
              {ghostSummary.name}
            </p>
            <span className={REMOVE_COLUMN_CLASS} aria-hidden />
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={containerRef}
      className={["relative min-w-0 shrink-0", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      {ghostPortal}
      <button
        type="button"
        onClick={toggleOpen}
        disabled={disabled || loadingDetails}
        aria-label={
          n === 0
            ? triggerEmptyLabel
            : n === 1
              ? `1 Assignee (${triggerSummaries[0]?.name ?? "selected"})`
              : `${n} assignees selected`
        }
        className={`grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1.5 overflow-hidden rounded-lg border py-1.5 text-left text-sm transition-colors ${triggerPadX} ${
          open
            ? "border-blue-500 bg-neutral-800 text-white"
            : "border-neutral-700 bg-neutral-800 text-white hover:border-neutral-500"
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {n === 0 ? (
          <div className="flex min-h-[22px] min-w-0 items-center gap-2 overflow-hidden">
            <span
              className="hidden h-[22px] w-[22px] shrink-0 sm:block"
              aria-hidden
            />
            <span className="min-w-0 truncate text-xs font-medium">
              <span className="sm:hidden">{triggerEmptyLabelMobile}</span>
              <span className="hidden sm:inline">{triggerEmptyLabel}</span>
            </span>
          </div>
        ) : (
          <div className="flex min-h-[22px] min-w-0 items-center justify-center gap-2 overflow-hidden sm:justify-start">
            <span className="flex shrink-0 items-center">
              {triggerSummaries.map((s, i) => (
                <span
                  key={s.pageId}
                  className={i === 0 ? "relative" : "relative -ml-3"}
                  style={{
                    zIndex: triggerSummaries.length - i,
                  }}
                >
                  <span className="rounded-full ring-1 ring-neutral-800">
                    <NotionVerifyBadge
                      type={s.type}
                      size="sm"
                      rosetteFillOpacity={0.94}
                    />
                  </span>
                </span>
              ))}
            </span>
            <span className="hidden min-w-0 truncate text-xs font-medium sm:inline">
              {triggerText}
            </span>
          </div>
        )}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="shrink-0 justify-self-end text-neutral-400"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[70] mt-2 w-[min(100vw-2rem,22rem)] max-w-[calc(100vw-2rem)] rounded-2xl border border-neutral-700 bg-[#1e1e1e] shadow-2xl">
          <div className="border-b border-neutral-800 p-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people…"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-500 focus:border-blue-500 focus:outline-none"
              autoFocus={!isCoarsePointer}
            />
          </div>

          <div className="max-h-[min(22rem,50vh)] overflow-y-auto overscroll-contain">
            {selectedPageIds.length > 0 ? (
              <div
                ref={selectedBandRef}
                className="border-b border-neutral-800 px-2 py-1.5"
              >
                <div className="flex items-center justify-between px-1 py-0.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                  <span>{n} selected</span>
                </div>
                <ul ref={selectedListRef} className="space-y-0.5">
                  {displaySummaries.map((s) => {
                    const isDraggingRow = pointerDrag?.pageId === s.pageId;
                    return (
                      <li
                        key={summaryKey(s)}
                        data-assignee-row
                        data-page-id={s.pageId}
                        className={`${SELECTED_ROW_CLASS} transition-[transform,opacity,background-color] duration-100 ease-out ${
                          isDraggingRow
                            ? "pointer-events-none opacity-0"
                            : "bg-neutral-900/80"
                        }`}
                      >
                        <div
                          className={GRIP_COLUMN_CLASS}
                          onPointerDown={(e) => handleGripPointerDown(e, s)}
                          style={{ touchAction: "none" }}
                          aria-label={`Reorder ${s.name}`}
                        >
                          <ReorderGrip />
                        </div>
                        <NotionVerifyBadge type={s.type} />
                        <div className="min-w-0 flex-1 py-0.5">
                          <p className="truncate text-sm font-semibold leading-snug text-white">
                            {s.name}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAssignee(s.pageId)}
                          disabled={Boolean(pointerDrag)}
                          className={`${REMOVE_COLUMN_CLASS} rounded text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:pointer-events-none disabled:opacity-40`}
                          aria-label={`Remove ${s.name}`}
                        >
                          <span className="text-lg leading-none">−</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            <div className="px-2 py-1.5">
              <p className="px-1 py-0.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                Select more
              </p>
              {isLoadingPeople && !people ? (
                <p className="px-1 py-3 text-sm text-neutral-500">Loading…</p>
              ) : loadError ? (
                <p className="px-1 py-2 text-sm text-red-400">{loadError}</p>
              ) : available.length === 0 ? (
                <p className="px-1 py-3 text-sm text-neutral-500">
                  {people?.length === 0
                    ? "No people in directory."
                    : "No matches."}
                </p>
              ) : (
                <ul className="space-y-0.5 pb-2">
                  {available.map((s) => (
                    <li key={summaryKey(s)}>
                      <button
                        type="button"
                        onClick={() => addAssignee(s.pageId)}
                        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-neutral-800/90"
                      >
                        <NotionVerifyBadge type={s.type} />
                        <div className="min-w-0 flex-1 py-0.5">
                          <p className="truncate text-sm font-semibold leading-snug text-white">
                            {s.name}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
