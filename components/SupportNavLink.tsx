"use client";

/**
 * @module SupportNavLink
 *
 * Navigation link for the Support page that displays an amber unread-message
 * badge. End users poll `/api/support/unread` (unread staff replies); admins
 * poll `/api/support/unread-admin` (threads needing staff attention).
 *
 * Polls every 20 s while signed in; opening a thread clears the relevant flag.
 *
 * @see SiteHeader — renders this component in the main nav bar
 * @see SupportInbox — the page that clears the unread flag on open
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type SupportNavLinkProps = {
  isActive: boolean;
};

/**
 * Nav pill for the Support page with an optional unread-message indicator dot.
 *
 * @param props.isActive - Whether the Support route is the current page
 *   (controls the active/highlighted pill style).
 */
export default function SupportNavLink({ isActive }: SupportNavLinkProps) {
  const { data: session, status } = useSession();
  const isAdmin = Boolean(session?.isAdmin);
  const [unread, setUnread] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    let isMounted = true;
    const url = isAdmin ? "/api/support/unread-admin" : "/api/support/unread";

    const loadUnread = async () => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        const payload = (await response.json()) as { unread?: boolean };
        if (isMounted) {
          setUnread(Boolean(payload.unread));
        }
      } catch {
        if (isMounted) {
          setUnread(false);
        }
      }
    };

    void loadUnread();
    const interval = window.setInterval(loadUnread, 20_000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [status, isAdmin]);

  const showUnreadDot = status === "authenticated" && unread;

  return (
    <Link
      href="/support"
      className={`relative shrink-0 rounded-full border px-3 py-2 transition ${
        isActive
          ? "border-blue-400 bg-blue-500/15 text-blue-200"
          : "border-white/10 bg-white/5 text-neutral-300 hover:border-white/20 hover:bg-white/10 hover:text-white"
      }`}
    >
      Support
      {showUnreadDot ? (
        <span className="ml-2 inline-flex h-2.5 w-2.5 rounded-full bg-amber-400 align-middle" />
      ) : null}
    </Link>
  );
}
