"use client";

/**
 * @module AuthButton
 *
 * Displays a sign-in / sign-out card whose colour scheme and helper text
 * adapt to the current page context (home, booking, calendar, support).
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
function headerSignedInCardClass(pathname: string, hasBookingAccess?: boolean) {
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
    return `${email} will be used to reserve or cancel Jams.`;
  }
  if (pathname.startsWith("/support")) {
    return `${email} will be used to reply in support chats.`;
  }
  return `${email} will be used in this app.`;
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

  // Prefer cached session while status is "loading" (e.g. refetch) so the card
  // does not swap to a loading shell between navigations.
  if (session?.user?.email) {
    const body = headerSignedInBody(
      pathname,
      session.user.email,
      session.bookingAccess
    );
    const signedInCard = headerSignedInCardClass(pathname, session.bookingAccess);
    return (
      <div className={`${authCardShell} ${signedInCard.wrap}`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <p
              className={`text-sm font-semibold leading-snug ${signedInCard.headline}`}
            >
              Signed in
            </p>
            <p className={`mt-0.5 text-xs leading-snug ${signedInCard.body}`}>
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
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
          className="shrink-0 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-400 sm:ml-1"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
