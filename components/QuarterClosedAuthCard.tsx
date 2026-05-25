"use client";

/**
 * @module QuarterClosedAuthCard
 *
 * Slim sign-in/out card rendered on the {@link QuarterClosedScreen}. Mirrors
 * the home-page colour scheme of {@link AuthButton} (violet for admins,
 * emerald for signed-in non-admins, blue for signed-out) but drops the
 * profile-edit pencil and Notion-sync icons since they don't apply when
 * the app is gated closed.
 */

import { signIn, signOut, useSession } from "next-auth/react";

const cardShell =
  "w-full max-w-[18rem] rounded-xl border px-3 py-2.5 shadow-2xl shadow-black/20";

export default function QuarterClosedAuthCard() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div
        className={`${cardShell} border-neutral-800 bg-neutral-900 text-center text-sm text-neutral-400`}
      >
        Loading...
      </div>
    );
  }

  if (session?.user?.email) {
    const isAdmin = !!session.isAdmin;
    const colors = isAdmin
      ? {
          wrap: "border-violet-500/30 bg-violet-500/10",
          headline: "text-violet-100",
          body: "text-violet-100/85",
        }
      : {
          wrap: "border-emerald-500/25 bg-emerald-500/10",
          headline: "text-emerald-100",
          body: "text-emerald-100/85",
        };

    return (
      <div className={`${cardShell} ${colors.wrap}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`text-sm font-semibold leading-snug ${colors.headline}`}>
              Signed in
              {isAdmin && (
                <span className="ml-2 inline-flex items-center rounded-full bg-violet-500/20 px-2 py-0.5 align-middle text-[10px] font-semibold tracking-wide text-violet-300">
                  Admin
                </span>
              )}
            </p>
            <p className={`mt-0.5 truncate text-xs leading-snug ${colors.body}`}>
              {session.user.email}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void signOut({ callbackUrl: "/" })}
            className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium leading-none text-white transition hover:bg-white/15"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${cardShell} border-blue-500/20 bg-blue-500/10`}>
      <div className="flex flex-col gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug text-blue-100">
            Signed out
          </p>
          <p className="mt-0.5 text-xs leading-snug text-blue-100/85">
            Admins can sign in to access the app.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void signIn("google", { callbackUrl: "/" })}
          className="w-full rounded-lg bg-blue-500 px-3 py-2 text-xs font-medium leading-none text-white transition hover:bg-blue-400"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
