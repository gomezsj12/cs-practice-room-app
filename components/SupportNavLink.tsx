"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type SupportNavLinkProps = {
  isActive: boolean;
};

export default function SupportNavLink({ isActive }: SupportNavLinkProps) {
  const { status } = useSession();
  const [unread, setUnread] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") {
      setUnread(false);
      return;
    }

    let isMounted = true;

    const loadUnread = async () => {
      try {
        const response = await fetch("/api/support/unread", { cache: "no-store" });
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
  }, [status]);

  return (
    <Link
      href="/support"
      className={`relative rounded-full border px-3 py-1.5 transition ${
        isActive
          ? "border-blue-400 bg-blue-500/15 text-blue-200"
          : "border-white/10 bg-white/5 text-neutral-300 hover:border-white/20 hover:bg-white/10 hover:text-white"
      }`}
    >
      Support
      {unread ? (
        <span className="ml-2 inline-flex h-2.5 w-2.5 rounded-full bg-amber-400 align-middle" />
      ) : null}
    </Link>
  );
}
