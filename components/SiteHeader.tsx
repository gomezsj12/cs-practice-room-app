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
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-5 px-4 py-6 text-white sm:gap-6 sm:px-6 sm:py-7 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-start md:gap-x-6 md:gap-y-0 lg:gap-x-10">
        <nav
          aria-label="Main"
          className="col-start-1 row-start-1 flex flex-wrap justify-center gap-2 text-sm justify-self-center md:col-start-2 md:row-start-1 md:self-center md:items-center md:justify-center"
        >
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

        <div className="col-start-1 row-start-2 flex w-full min-w-0 flex-col space-y-2 md:col-start-1 md:row-start-1 md:max-w-3xl md:w-full md:space-y-2 md:justify-self-start lg:max-w-4xl">
          <Link
            href="/"
            className="block shrink-0 text-4xl font-semibold tracking-tight text-white transition hover:text-blue-300 sm:text-5xl md:text-3xl lg:text-4xl"
          >
            CS Practice Room
          </Link>
          <p className="shrink-0 text-lg leading-snug text-neutral-300 sm:text-xl max-md:overflow-x-auto max-md:pb-0.5 md:whitespace-nowrap md:text-base md:leading-snug lg:text-lg">
            Booking, Jam Reservations, and Student Support.
          </p>
        </div>

        <div className="col-start-1 row-start-3 flex w-full justify-center md:col-start-3 md:row-start-1 md:w-auto md:justify-end md:justify-self-end md:self-start">
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
