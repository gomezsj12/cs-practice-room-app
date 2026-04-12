"use client";

/**
 * @module AuthButton
 *
 * Displays a sign-in / sign-out card whose colour scheme and helper text
 * adapt to the current page context (home, booking, calendar, support).
 *
 * When signed out, the card prompts the user with Google OAuth; when signed
 * in, it shows a confirmation banner with a sign-out button plus small
 * pencil (edit profile) and refresh (sync) icon buttons beneath it.
 *
 * @see SiteHeader — parent component that positions this card
 * @see EditProfileModal — opened by the pencil icon
 * @see useProfileSync — powers the refresh icon and auto-sync
 */

import { useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import EditProfileModal from "@/components/EditProfileModal";
import { useProfileSync } from "@/hooks/useProfileSync";

const authCardShell =
  "w-full max-w-md rounded-xl border px-3 py-2.5 sm:w-[22rem]";

/** Returns per-page colour tokens for the signed-out auth card. */
function headerSignOutCardClass(pathname: string) {
  if (pathname.startsWith("/booking")) {
    return {
      wrap: "border-red-500/30 bg-red-500/10",
      headline: "text-red-100",
      body: "text-red-100/85",
    };
  }
  if (pathname.startsWith("/calendar")) {
    return {
      wrap: "border-amber-500/25 bg-amber-500/10",
      headline: "text-amber-100",
      body: "text-amber-100/80",
    };
  }
  if (pathname.startsWith("/support")) {
    return {
      wrap: "border-red-500/30 bg-red-500/10",
      headline: "text-red-100",
      body: "text-red-100/85",
    };
  }
  return {
    wrap: "border-blue-500/20 bg-blue-500/10",
    headline: "text-blue-100",
    body: "text-blue-100/85",
  };
}

/** Returns contextual body copy shown when the user is signed out. */
function headerSignOutBody(pathname: string): string {
  if (pathname.startsWith("/booking")) {
    return "You do not have access to the booking form";
  }
  if (pathname.startsWith("/calendar")) {
    return "Browse the calendar anytime, sign in to reserve Jams.";
  }
  if (pathname.startsWith("/support")) {
    return "You don't have access to your support chats.";
  }
  return "Sign in to access more features.";
}

/** Returns per-page colour tokens for the signed-in auth card. */
function headerSignedInCardClass(
  pathname: string,
  hasBookingAccess?: boolean,
  isAdmin?: boolean,
) {
  if (isAdmin) {
    return {
      wrap: "border-violet-500/30 bg-violet-500/10",
      headline: "text-violet-100",
      body: "text-violet-100/85",
    };
  }
  if (pathname.startsWith("/booking")) {
    if (hasBookingAccess) {
      return {
        wrap: "border-emerald-500/30 bg-emerald-500/10",
        headline: "text-emerald-100",
        body: "text-emerald-100/85",
      };
    }
    return {
      wrap: "border-red-500/30 bg-red-500/10",
      headline: "text-red-100",
      body: "text-red-100/85",
    };
  }
  return {
    wrap: "border-emerald-500/25 bg-emerald-500/10",
    headline: "text-emerald-100",
    body: "text-emerald-100/85",
  };
}

/** Returns contextual body copy shown when the user is signed in. */
function headerSignedInBody(
  pathname: string,
  email: string,
  hasBookingAccess?: boolean
): string {
  if (pathname.startsWith("/booking")) {
    if (hasBookingAccess) {
      return "Your login will autofill your details in the booking form.";
    }
    return "Your account does not have access to book practices.";
  }
  if (pathname.startsWith("/calendar")) {
    return `${email} will be used to reserve or cancel.`;
  }
  if (pathname.startsWith("/support")) {
    return `${email} will be used to reply in support chats.`;
  }
  return `${email} will be used in this app.`;
}

/**
 * Auth state card: sign-in prompt (signed out) or confirmation banner (signed in).
 *
 * When signed in with a complete profile, the card also shows:
 * - A **pencil icon** to edit the linked WWU email (opens {@link EditProfileModal}).
 * - A **refresh icon** that manually re-syncs the profile with Notion data
 *   (via {@link useProfileSync}). The icon rotates while syncing, and shows
 *   a red cooldown counter when rate-limited (1 manual sync per 30 s).
 */
export default function AuthButton() {
  const { data: session, status } = useSession();
  const pathname = usePathname() || "/";

  const profileComplete = !!session?.profileComplete;

  const {
    syncStatus,
    isManualSyncing,
    cooldownRemaining,
    triggerManualSync,
  } = useProfileSync(profileComplete);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editModalEmail, setEditModalEmail] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(false);

  const handleSignIn = () => {
    void signIn("google", { callbackUrl: pathname || "/" });
  };

  const handleSignOut = () => {
    void signOut({ callbackUrl: "/" });
  };

  async function handleOpenEdit() {
    setLoadingProfile(true);
    try {
      const res = await fetch("/api/profile/me");
      if (res.ok) {
        const { profile } = await res.json();
        setEditModalEmail(profile?.walla_walla_email ?? "");
      } else {
        setEditModalEmail("");
      }
    } catch {
      setEditModalEmail("");
    }
    setLoadingProfile(false);
    setShowEditModal(true);
  }

  if (session?.user?.email) {
    const isAdmin = !!session.isAdmin;
    const body = headerSignedInBody(
      pathname,
      session.user.email,
      session.bookingAccess
    );
    const signedInCard = headerSignedInCardClass(pathname, session.bookingAccess, isAdmin);

    const refreshColorClass =
      syncStatus === "cooldown" || syncStatus === "error"
        ? "text-red-400"
        : "text-neutral-500 hover:text-neutral-300";

    return (
      <>
        <div className={`${authCardShell} ${signedInCard.wrap}`}>
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className={`text-sm font-semibold leading-snug ${signedInCard.headline}`}
                >
                  Signed in
                  {isAdmin && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-violet-500/20 px-2 py-0.5 align-middle text-[10px] font-semibold tracking-wide text-violet-300">
                      Admin
                    </span>
                  )}
                </p>
                <p className={`mt-0.5 text-xs leading-snug ${signedInCard.body}`}>
                  {body}
                </p>
              </div>
            </div>

            {/* Sign out + action icons — bottom-right row */}
            <div className="flex items-center justify-end gap-2.5">
              {profileComplete && (
                <div className="flex items-center gap-3 sm:gap-2">
                  {/* Edit profile (pencil) */}
                  <button
                    type="button"
                    onClick={handleOpenEdit}
                    disabled={loadingProfile}
                    className="p-1 text-neutral-500 transition hover:text-neutral-300 disabled:opacity-50 sm:p-0"
                    aria-label="Edit profile"
                    title="Edit WWU email"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="sm:h-3.5 sm:w-3.5"
                    >
                      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                    </svg>
                  </button>

                  {/* Refresh / sync */}
                  <button
                    type="button"
                    onClick={triggerManualSync}
                    disabled={isManualSyncing}
                    className={`relative p-1 transition sm:p-0 ${refreshColorClass} disabled:opacity-50`}
                    aria-label="Sync profile with Notion"
                    title={
                      syncStatus === "cooldown"
                        ? `Wait ${cooldownRemaining}s`
                        : "Sync profile"
                    }
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`sm:h-3.5 sm:w-3.5 ${isManualSyncing ? "animate-spin" : ""}`}
                      style={
                        isManualSyncing
                          ? { animationDuration: "1.5s" }
                          : undefined
                      }
                    >
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
                      <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
                    </svg>

                    {/* Cooldown counter overlay */}
                    {syncStatus === "cooldown" && cooldownRemaining > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[7px] font-bold leading-none text-white">
                        {cooldownRemaining}
                      </span>
                    )}
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-lg bg-white/10 px-3.5 py-2 text-xs font-medium leading-none text-white transition hover:bg-white/15"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>

        {showEditModal && (
          <EditProfileModal
            currentWwuEmail={editModalEmail}
            onClose={() => setShowEditModal(false)}
          />
        )}
      </>
    );
  }

  if (status === "loading") {
    return (
      <div
        className={`${authCardShell} border-neutral-800 bg-neutral-900 text-sm text-neutral-400`}
      >
        Loading...
      </div>
    );
  }

  const card = headerSignOutCardClass(pathname);
  const body = headerSignOutBody(pathname);

  return (
    <div className={`${authCardShell} ${card.wrap}`}>
      <div className="flex flex-col gap-2">
        <div className="min-w-0">
          <p
            className={`text-sm font-semibold leading-snug ${card.headline}`}
          >
            Signed out
          </p>
          <p className={`mt-0.5 text-xs leading-snug ${card.body}`}>{body}</p>
        </div>
        <button
          type="button"
          onClick={handleSignIn}
          className="w-full rounded-lg bg-blue-500 px-3 py-2 text-xs font-medium leading-none text-white transition hover:bg-blue-400"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
