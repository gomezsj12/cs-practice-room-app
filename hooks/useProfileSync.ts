/**
 * @file Profile sync hook — manual and automatic Notion re-sync.
 *
 * Manages the lifecycle of profile syncing:
 * - **Manual sync** via `triggerManualSync()` with a 30 s rate limit.
 * - **Auto-sync** on mount and every 60 s in the background (updates Supabase
 *   only; skips `session.update({})` unless booking/admin flags change or
 *   `profiles.updated_at` changed, so the app does not re-render on every tick).
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
import { SESSION_JWT_REFRESH_PAYLOAD } from "@/lib/session-refresh";

const MANUAL_COOLDOWN_MS = 30_000;
const AUTO_SYNC_INTERVAL_MS = 60_000;

/** 2 full rotations at 1.5 s each. */
const MIN_SPIN_MS = 3_000;

type SyncStatus = "idle" | "syncing" | "cooldown" | "error";

/**
 * Hook return value for the refresh-button UI in {@link AuthButton}.
 *
 * `cooldownRemaining` is seconds left (0 when not in cooldown).
 * `isManualSyncing` is true while the icon should be spinning.
 */
type UseProfileSyncReturn = {
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
        profile?: {
          notion_page_id?: string | null;
          type?: string | null;
          updated_at?: string;
        };
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
      const nextStamp =
        typeof profile?.updated_at === "string" ? profile.updated_at : null;
      const prevStamp = sessionRef.current?.profileUpdatedAt ?? null;
      const profileRowChanged =
        nextStamp != null && nextStamp !== prevStamp;
      if (
        nextBookingAccess !== prevBookingAccess ||
        nextIsAdmin !== prevIsAdmin ||
        profileRowChanged
      ) {
        await updateRef.current(SESSION_JWT_REFRESH_PAYLOAD);
      }
    } catch {
      /* silent */
    } finally {
      syncInProgressRef.current = false;
    }
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

    const syncPromise = (async (): Promise<boolean> => {
      if (syncInProgressRef.current) return true;
      syncInProgressRef.current = true;
      try {
        const res = await fetch("/api/profile/sync", { method: "POST" });
        if (!res.ok) return false;
        const updated = await updateRef.current(SESSION_JWT_REFRESH_PAYLOAD);
        return updated != null;
      } catch {
        return false;
      } finally {
        syncInProgressRef.current = false;
      }
    })();

    void syncPromise.then((ok) => {
      const spinElapsed = Date.now() - spinStart;
      const remainingSpin = Math.max(0, MIN_SPIN_MS - spinElapsed);

      setTimeout(() => {
        if (!mountedRef.current) return;
        setIsManualSyncing(false);
        setSyncStatus(ok ? "idle" : "error");
        manualBusyRef.current = false;
        lastManualTimestampRef.current = Date.now();
      }, remainingSpin);
    });
  }, []);

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
