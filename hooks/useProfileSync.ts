/**
 * @file Profile sync hook — manual and automatic Notion re-sync.
 *
 * Manages the lifecycle of profile syncing:
 * - **Manual sync** via `triggerManualSync()` with a 30 s rate limit.
 * - **Auto-sync** on mount and every 60 s in the background (updates Supabase
 *   only; skips `session.update()` unless `bookingAccess` or `isAdmin`
 *   would change (per `/api/profile/sync` hints), so the app does not re-render
 *   on every tick).
 * - **Rotation state** for the refresh icon animation (minimum 2 full
 *   rotations at 1.5 s each = 3 s spin floor).
 * - **Cooldown timer** for the rate-limit countdown display — only
 *   shown when the user clicks *after* the spin has finished.
 *
 * Clicks while the icon is spinning or the sync is in flight are ignored.
 *
 * @see {@link @/app/api/profile/sync/route} — server endpoint
 * @see {@link @/components/AuthButton} — consumes this hook
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { profileHasBookingAccess } from "@/lib/profile-access";

const MANUAL_COOLDOWN_MS = 30_000;
const AUTO_SYNC_INTERVAL_MS = 60_000;

/** 2 full rotations at 1.5 s each. */
const MIN_SPIN_MS = 3_000;

export type SyncStatus = "idle" | "syncing" | "cooldown" | "error";

/**
 * Hook return value for the refresh-button UI in {@link AuthButton}.
 *
 * `cooldownRemaining` is seconds left (0 when not in cooldown).
 * `isManualSyncing` is true while the icon should be spinning.
 */
export type UseProfileSyncReturn = {
  syncStatus: SyncStatus;
  isManualSyncing: boolean;
  cooldownRemaining: number;
  triggerManualSync: () => void;
};

/**
 * Profile sync hook consumed by the AuthButton refresh icon.
 *
 * @param enabled - Pass `false` to disable all syncing (e.g. when the user
 *                  has no profile yet or is signed out).
 */
export function useProfileSync(enabled: boolean): UseProfileSyncReturn {
  const { data: session, update } = useSession();

  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  const syncInProgressRef = useRef(false);
  const manualBusyRef = useRef(false);
  const lastManualTimestampRef = useRef(0);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const updateRef = useRef(update);
  updateRef.current = update;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Fire-and-forget background sync (no animation, no cooldown).
   * Calls `session.update()` only when sync response indicates `bookingAccess`
   * or `isAdmin` would change.
   */
  const performBackgroundSync = useCallback(async () => {
    if (syncInProgressRef.current) return;
    syncInProgressRef.current = true;
    try {
      const res = await fetch("/api/profile/sync", { method: "POST" });
      if (!res.ok) return;
      const body: unknown = await res.json();
      if (!body || typeof body !== "object") return;
      const o = body as {
        profile?: { notion_page_id?: string | null; type?: string | null };
        sessionBookingAccess?: boolean;
        sessionIsAdmin?: boolean;
      };
      const profile = o.profile;
      const nextBookingAccess =
        typeof o.sessionBookingAccess === "boolean"
          ? o.sessionBookingAccess
          : profile
            ? profileHasBookingAccess(profile.notion_page_id, profile.type)
            : false;
      const nextIsAdmin =
        typeof o.sessionIsAdmin === "boolean"
          ? o.sessionIsAdmin
          : (sessionRef.current?.isAdmin ?? false);
      const prevBookingAccess = !!sessionRef.current?.bookingAccess;
      const prevIsAdmin = !!sessionRef.current?.isAdmin;
      if (nextBookingAccess !== prevBookingAccess || nextIsAdmin !== prevIsAdmin) {
        await updateRef.current();
      }
    } catch {
      /* silent */
    } finally {
      syncInProgressRef.current = false;
    }
  }, []);

  const startCooldown = useCallback(() => {
    lastManualTimestampRef.current = Date.now();

    if (cooldownIntervalRef.current) {
      clearInterval(cooldownIntervalRef.current);
    }

    setCooldownRemaining(Math.ceil(MANUAL_COOLDOWN_MS / 1000));
    setSyncStatus("cooldown");

    cooldownIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - lastManualTimestampRef.current;
      const remaining = Math.ceil(
        (MANUAL_COOLDOWN_MS - elapsed) / 1000,
      );

      if (remaining <= 0) {
        if (cooldownIntervalRef.current) {
          clearInterval(cooldownIntervalRef.current);
          cooldownIntervalRef.current = null;
        }
        if (mountedRef.current) {
          setCooldownRemaining(0);
          setSyncStatus("idle");
        }
        return;
      }

      if (mountedRef.current) setCooldownRemaining(remaining);
    }, 1000);
  }, []);

  /**
   * Manual sync: ignored if the icon is already spinning/syncing or in
   * cooldown. Guarantees at least {@link MIN_SPIN_MS} of visible rotation
   * before returning to idle, then starts the 30 s cooldown silently
   * (only surfaced if the user clicks again).
   */
  const triggerManualSync = useCallback(() => {
    if (manualBusyRef.current) return;

    const elapsed = Date.now() - lastManualTimestampRef.current;
    if (elapsed < MANUAL_COOLDOWN_MS) {
      const remaining = Math.ceil((MANUAL_COOLDOWN_MS - elapsed) / 1000);
      setCooldownRemaining(remaining);
      setSyncStatus("cooldown");

      if (!cooldownIntervalRef.current) {
        cooldownIntervalRef.current = setInterval(() => {
          const now = Date.now();
          const elapsedNow = now - lastManualTimestampRef.current;
          const rem = Math.ceil((MANUAL_COOLDOWN_MS - elapsedNow) / 1000);
          if (rem <= 0) {
            if (cooldownIntervalRef.current) {
              clearInterval(cooldownIntervalRef.current);
              cooldownIntervalRef.current = null;
            }
            if (mountedRef.current) {
              setCooldownRemaining(0);
              setSyncStatus("idle");
            }
            return;
          }
          if (mountedRef.current) setCooldownRemaining(rem);
        }, 1000);
      }
      return;
    }

    manualBusyRef.current = true;
    setIsManualSyncing(true);
    setSyncStatus("syncing");

    const spinStart = Date.now();

    const syncPromise = (async () => {
      if (syncInProgressRef.current) return;
      syncInProgressRef.current = true;
      try {
        const res = await fetch("/api/profile/sync", { method: "POST" });
        if (res.ok) await updateRef.current();
      } catch {
        /* error state handled after spin */
      } finally {
        syncInProgressRef.current = false;
      }
    })();

    void syncPromise.then(() => {
      const spinElapsed = Date.now() - spinStart;
      const remainingSpin = Math.max(0, MIN_SPIN_MS - spinElapsed);

      setTimeout(() => {
        if (!mountedRef.current) return;
        setIsManualSyncing(false);
        setSyncStatus("idle");
        manualBusyRef.current = false;
        lastManualTimestampRef.current = Date.now();
      }, remainingSpin);
    });
  }, [startCooldown]);

  // Auto-sync on mount + interval
  useEffect(() => {
    if (!enabled) return;

    void performBackgroundSync();

    const id = setInterval(() => {
      void performBackgroundSync();
    }, AUTO_SYNC_INTERVAL_MS);

    return () => {
      clearInterval(id);
    };
  }, [enabled, performBackgroundSync]);

  // Cleanup cooldown interval on unmount
  useEffect(() => {
    return () => {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
        cooldownIntervalRef.current = null;
      }
    };
  }, []);

  return {
    syncStatus,
    isManualSyncing,
    cooldownRemaining,
    triggerManualSync,
  };
}
