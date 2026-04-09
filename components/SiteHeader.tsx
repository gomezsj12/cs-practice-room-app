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
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-5 px-4 py-6 text-white sm:gap-6 sm:px-6 sm:py-7 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-stretch md:gap-x-6 md:gap-y-0 lg:gap-x-10">
        <nav
          aria-label="Main"
          className="col-start-1 row-start-1 flex flex-wrap justify-center gap-2 text-sm justify-self-center md:col-start-2 md:row-start-1 md:h-full md:min-h-0 md:items-center md:justify-center"
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

        <div className="col-start-1 row-start-2 min-w-0 space-y-2 md:col-start-1 md:row-start-1 md:flex md:h-full md:min-h-0 md:max-w-md md:flex-col md:justify-between md:justify-self-start md:space-y-0 lg:max-w-lg">
          <Link
            href="/"
            className="block shrink-0 text-3xl font-semibold tracking-tight text-white transition hover:text-blue-300 sm:text-4xl md:text-3xl lg:text-4xl"
          >
            CS Practice Room
          </Link>
          <p className="shrink-0 text-base leading-relaxed text-neutral-300 sm:text-lg md:mt-0 md:text-base md:leading-snug lg:text-lg">
            Booking, jam reservations, and student support in one place.
          </p>
        </div>

        <div className="col-start-1 row-start-3 flex w-full justify-center md:col-start-3 md:row-start-1 md:h-full md:min-h-0 md:w-auto md:items-center md:justify-end md:justify-self-end">
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
