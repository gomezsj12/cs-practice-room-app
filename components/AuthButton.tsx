"use client";

/**
 * @module AuthButton
 *
 * Displays a sign-in / sign-out card whose colour scheme and helper text
 * adapt to the current page context (home, booking, jam, support).
 *
 * When signed out, the card prompts the user with Google OAuth; when signed
 * in, it shows a confirmation banner with a sign-out button. The card is
 * rendered inside {@link SiteHeader} on every page.
 *
 * @see SiteHeader — parent component that positions this card
 */

import { signIn, signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

const authCardShell =
  "w-full max-w-md rounded-xl border px-3 py-2.5 md:max-w-sm";

/** Returns per-page colour tokens for the signed-out auth card. */
function headerSignOutCardClass(pathname: string) {
  if (pathname.startsWith("/booking")) {
    return {
      wrap: "border-amber-500/25 bg-amber-500/10",
      headline: "text-amber-100",
      body: "text-amber-100/80",
    };
  }
  if (pathname.startsWith("/jam")) {
    return {
      wrap: "border-amber-500/25 bg-amber-500/10",
      headline: "text-amber-100",
      body: "text-amber-100/80",
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
    return "The booking form works when signed-out.";
  }
  if (pathname.startsWith("/jam")) {
    return "Browse the calendar anytime. Sign in to drag-select and reserve.";
  }
  return "One account for jam scheduling and other shared tools in this app.";
}

/** Returns contextual body copy shown when the user is signed in. */
function headerSignedInBody(pathname: string): string {
  if (pathname.startsWith("/booking")) {
    return "Fillout below; jam scheduling shares this Google account.";
  }
  if (pathname.startsWith("/jam")) {
    return "Drag-select on the calendar below to reserve or cancel jams.";
  }
  return "Booking, jam scheduler, and future tools share this Google account.";
}

/**
 * Auth state card: sign-in prompt (signed out) or confirmation banner (signed in).
 * Card colour and helper text vary by the current route pathname.
 */
export default function AuthButton() {
  const { data: session, status } = useSession();
  const pathname = usePathname() || "/";

  const handleSignIn = () => {
    void signIn("google", { callbackUrl: pathname || "/" });
  };

  const handleSignOut = () => {
    void signOut({ callbackUrl: "/" });
  };

  if (status === "loading") {
    return (
      <div
        className={`${authCardShell} border-neutral-800 bg-neutral-900 text-sm text-neutral-400`}
      >
        Loading...
      </div>
    );
  }

  if (session?.user?.email) {
    const body = headerSignedInBody(pathname);
    return (
      <div
        className={`${authCardShell} border-emerald-500/25 bg-emerald-500/10`}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug text-emerald-100">
              Signed in
            </p>
            <p className="mt-0.5 text-xs leading-snug text-emerald-100/85">
              {body}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/15 sm:ml-1"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const card = headerSignOutCardClass(pathname);
  const body = headerSignOutBody(pathname);

  return (
    <div className={`${authCardShell} ${card.wrap}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <p
            className={`text-sm font-semibold leading-snug ${card.headline}`}
          >
            Google sign-in
          </p>
          <p className={`mt-0.5 text-xs leading-snug ${card.body}`}>{body}</p>
        </div>
        <button
          type="button"
          onClick={handleSignIn}
          className="shrink-0 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-400 sm:ml-1"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
