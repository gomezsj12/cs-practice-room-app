"use client";

/**
 * @module AccountSetupModal
 *
 * Full-screen overlay shown once when a new Google user signs in for the
 * first time (i.e. no matching row in the Supabase `profiles` table).
 *
 * Three-phase UI flow:
 * 1. **form**: collects WWU email with format validation on submit only.
 * 2. **creating**: animated progress bar while the API creates the profile.
 * 3. **done**: success message + booking-access indicator. Dismissed only
 *    by clicking "Done" (no auto-dismiss timer). When the new profile has
 *    admin status, a violet "Admin access granted" card is shown.
 *
 * Dismissing the modal at any point signs the user out.
 *
 * @see {@link @/app/api/profile/setup/route}: server-side handler
 * @see {@link @/auth}: session shape (`profileComplete` flag)
 */

import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { profileHasBookingAccess } from "@/lib/profile-access";
import type { ProfileRow } from "@/lib/types";
import { WWU_EMAIL_RE } from "@/lib/validation";

type Phase = "form" | "creating" | "done";

export default function AccountSetupModal() {
  const { data: session, status, update } = useSession();

  const [wwuEmail, setWwuEmail] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [serverError, setServerError] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [hasBookingAccess, setHasBookingAccess] = useState(false);
  const [isProfileAdmin, setIsProfileAdmin] = useState(false);
  const [completed, setCompleted] = useState(false);

  const [loadingProgress, setLoadingProgress] = useState(0);
  const loadingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const apiFinished = useRef(false);

  useEffect(() => {
    if (phase === "creating") {
      setLoadingProgress(0);
      apiFinished.current = false;
      let progress = 0;
      loadingInterval.current = setInterval(() => {
        if (apiFinished.current) {
          progress += 5;
        } else {
          progress += 2;
          if (progress >= 90) progress = 90;
        }
        if (progress >= 100) {
          progress = 100;
          setLoadingProgress(100);
          if (loadingInterval.current) {
            clearInterval(loadingInterval.current);
            loadingInterval.current = null;
          }
          setPhase("done");
          return;
        }
        setLoadingProgress(progress);
      }, 60);
    } else if (phase !== "done") {
      if (loadingInterval.current) {
        clearInterval(loadingInterval.current);
        loadingInterval.current = null;
      }
    }
    return () => {
      if (loadingInterval.current) {
        clearInterval(loadingInterval.current);
        loadingInterval.current = null;
      }
    };
  }, [phase]);

  const isVisible =
    !completed &&
    status === "authenticated" &&
    session?.profileComplete === false;

  if (!isVisible) return null;

  const isValidEmail = WWU_EMAIL_RE.test(wwuEmail.trim());
  const showError = submitAttempted && !isValidEmail;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);

    if (!isValidEmail) return;

    setPhase("creating");
    setServerError("");

    try {
      const res = await fetch("/api/profile/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wwuEmail: wwuEmail.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setServerError(data.error ?? "Something went wrong");
        setPhase("form");
        return;
      }

      const { profile } = (await res.json()) as { profile: ProfileRow };
      setHasBookingAccess(
        profileHasBookingAccess(profile?.notion_page_id, profile?.type),
      );
      setIsProfileAdmin(!!profile?.is_admin);
      apiFinished.current = true;
    } catch {
      setServerError("Network error. Please try again");
      setPhase("form");
    }
  }

  function handleDismiss() {
    if (phase === "done") {
      setCompleted(true);
      void update({ profileComplete: true });
      return;
    }
    void signOut({ callbackUrl: "/" });
  }

  const user = session.user;

  return (
    <div
      data-blocking-app-modal
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-xl"
    >
      <div className="relative mx-4 w-full max-w-md rounded-3xl border border-white/10 bg-[#0e0e0e] p-8 shadow-2xl shadow-black/40">
        {/* Dismiss / close button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-neutral-500 transition hover:bg-white/10 hover:text-neutral-300"
          aria-label={phase === "done" ? "Close" : "Close and sign out"}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* ── Phase: form ── */}
        {phase === "form" && (
          <>
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              Real Quick, Let&apos;s get you set up...
            </h2>
            <p className="mt-1.5 text-sm text-neutral-400">
              We just need your university email to finish creating your
              account.
            </p>

            {/* Google account display */}
            <div className="mt-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              {user?.image ? (
                <img
                  src={user.image}
                  alt=""
                  className="h-10 w-10 rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20 text-sm font-bold text-blue-300">
                  {user?.name?.[0]?.toUpperCase() ?? "?"}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {user?.name ?? "Google Account"}
                </p>
                <p className="truncate text-xs text-neutral-400">
                  {user?.email ?? ""}
                </p>
              </div>
              <span className="ml-auto shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
                Connected
              </span>
            </div>

            {/* WWU email form */}
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="wwu-email"
                  className="mb-1.5 block text-sm font-medium text-neutral-300"
                >
                  Walla Walla University Email
                </label>
                <input
                  id="wwu-email"
                  type="email"
                  autoComplete="email"
                  placeholder="First.Last@wallawalla.edu"
                  value={wwuEmail}
                  onChange={(e) => {
                    setWwuEmail(e.target.value);
                    if (submitAttempted) setSubmitAttempted(false);
                    setServerError("");
                  }}
                  className={`w-full rounded-xl border bg-white/5 px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none transition focus:ring-2 ${
                    showError
                      ? "border-red-500/50 focus:ring-red-500/30"
                      : "border-white/10 focus:ring-blue-500/30"
                  }`}
                />
                {showError && (
                  <p className="mt-1.5 text-xs text-red-400">
                    Must be in First.Last@wallawalla.edu format
                  </p>
                )}
                {serverError && (
                  <p className="mt-1.5 text-xs text-red-400">{serverError}</p>
                )}
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
              >
                Continue
              </button>
            </form>

            <p className="mt-4 text-center text-xs text-neutral-600">
              Closing this window will sign you out.
            </p>
          </>
        )}

        {/* ── Phase: creating ── */}
        {phase === "creating" && (
          <div className="flex flex-col items-center py-6">
            <p className="text-lg font-semibold text-white">
              Setting up your profile...
            </p>
            <p className="mt-1.5 text-sm text-neutral-400">
              Checking your university email
            </p>
            <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-blue-500 transition-[width] duration-150 ease-out"
                style={{ width: `${loadingProgress}%` }}
                role="progressbar"
                aria-valuenow={loadingProgress}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
        )}

        {/* ── Phase: done ── */}
        {phase === "done" && (
          <div className="flex flex-col items-center py-4">
            {/* Success checkmark */}
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full ${
                isProfileAdmin ? "bg-violet-500/15" : "bg-emerald-500/15"
              }`}
            >
              {isProfileAdmin ? (
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#a78bfa"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              ) : (
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>

            <p className="mt-4 text-lg font-semibold text-white">
              {isProfileAdmin ? "Welcome, Admin!" : "Profile created!"}
            </p>

            {/* Admin access indicator */}
            {isProfileAdmin && (
              <div className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-violet-500/25 bg-violet-500/10 px-4 py-3">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#a78bfa"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-violet-300">
                    Admin access granted
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    You can cancel any booked session, and you have
                    full access to all support conversations.
                  </p>
                </div>
              </div>
            )}

            {/* Booking access indicator */}
            <div
              className={`mt-4 flex w-full items-center gap-3 rounded-2xl border px-4 py-3 ${
                hasBookingAccess
                  ? "border-emerald-500/25 bg-emerald-500/10"
                  : "border-amber-500/25 bg-amber-500/10"
              }`}
            >
              {hasBookingAccess ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              )}
              <div>
                <p
                  className={`text-sm font-medium ${
                    hasBookingAccess ? "text-emerald-300" : "text-amber-300"
                  }`}
                >
                  {hasBookingAccess
                    ? "Booking form access enabled"
                    : "Booking form access pending"}
                </p>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {hasBookingAccess
                    ? "Your profile is linked to the practice room system."
                    : "Your email wasn't found in our system yet. Contact an admin for booking access."}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDismiss}
              className="mt-5 w-full rounded-xl bg-white/10 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
