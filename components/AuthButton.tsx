"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export default function AuthButton() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm text-neutral-400">
        Loading...
      </div>
    );
  }

  if (session?.user?.email) {
    return (
      <div className="flex flex-col items-start gap-2 md:items-end">
        <p className="text-xs text-neutral-500">{session.user.email}</p>

        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="rounded-xl bg-neutral-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => signIn("google")}
      className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400"
    >
      Sign in with Google
    </button>
  );
}