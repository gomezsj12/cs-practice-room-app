"use client";

/**
 * @module SiteHeader
 *
 * Global site header rendered on every page via the root layout. Contains the
 * app title/tagline, the main navigation pill bar, and the {@link AuthButton}
 * sign-in/out card.
 *
 * Layout uses a responsive CSS Grid: on narrow viewports the three sections
 * stack vertically; on `md+` they sit in a single row (title | nav | auth).
 *
 * @see AuthButton — auth state card placed in the trailing column
 * @see SupportNavLink — special nav item that shows an unread-message badge
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthButton from "@/components/AuthButton";
import SupportNavLink from "@/components/SupportNavLink";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/booking", label: "Booking Form" },
  { href: "/jam", label: "Jams" },
  { href: "/support", label: "Support" },
];

/**
 * Renders the global site header with navigation and auth controls.
 * Active route is highlighted in the nav bar using the current pathname.
 */
export default function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-white/10 bg-black/30 backdrop-blur">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-5 px-4 pb-5 pt-6 text-white sm:gap-6 sm:px-6 sm:pt-7 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-start md:gap-x-6 md:gap-y-0 lg:gap-x-10">
        <nav
          aria-label="Main"
          className="col-start-1 row-start-1 flex min-w-0 w-full max-w-full flex-nowrap justify-center gap-2.5 overflow-x-auto overscroll-x-contain text-base justify-self-center md:col-start-2 md:row-start-1 md:self-center md:items-center md:justify-center md:overflow-visible"
        >
          {navItems.map((item) => {
            const isActive = pathname === item.href;

            if (item.href === "/support") {
              return <SupportNavLink key={item.href} isActive={isActive} />;
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 rounded-full border px-3 py-2 transition ${
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

        <div className="col-start-1 row-start-2 flex w-full min-w-0 flex-col space-y-2 max-md:pl-[calc(0.75rem+1px)] md:col-start-1 md:row-start-1 md:max-w-3xl md:w-full md:space-y-2 md:justify-self-start lg:max-w-4xl">
          <span className="block shrink-0 text-4xl font-semibold tracking-tight text-white sm:text-5xl md:text-3xl lg:text-4xl">
            CS Practice Room
          </span>
          <p className="shrink-0 text-base leading-snug text-neutral-300 max-md:whitespace-nowrap max-md:overflow-x-auto max-md:pb-0.5 md:whitespace-nowrap md:leading-snug lg:text-lg">
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
