"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthButton from "@/components/AuthButton";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/booking", label: "Booking Form" },
  { href: "/jam", label: "Jam Reservations" },
];

export default function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-white/10 bg-black/30 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 text-white md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-white transition hover:text-blue-300"
          >
            CS Practice Room
          </Link>
          <p className="text-sm text-neutral-400">
            Booking, jam reservations, and student support in one place.
          </p>
        </div>

        <div className="flex flex-col gap-4 md:items-end">
          <nav className="flex flex-wrap gap-2 text-sm">
            {navItems.map((item) => {
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-full border px-3 py-1.5 transition ${
                    isActive
                      ? "border-blue-400 bg-blue-500/15 text-blue-200"
                      : "border-white/10 bg-white/5 text-neutral-300 hover:border-white/20 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <AuthButton />
        </div>
      </div>
    </header>
  );
}
