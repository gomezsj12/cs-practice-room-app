"use client";

/**
 * @module SiteHeader
 *
 * Global site header rendered on every page via the root layout. Contains the
 * app title/tagline, the main navigation pill bar, and the {@link AuthButton}
 * sign-in/out card.
 *
 * Layout uses a three-tier responsive CSS Grid:
 * - **Phone (< 640px):** single column, stacked vertically (nav → title → auth).
 * - **Tablet (sm 640px – hd 1151px):** two-column, two-row grid
 *   (title + auth on row 1, nav spanning row 2).
 * - **Desktop (hd 1152px+):** three-column single row (title | nav | auth).
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
  { href: "/booking", label: "Booking" },
  { href: "/calendar", label: "Calendar" },
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
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-5 px-4 pb-5 pt-6 text-white sm:grid-cols-[1fr_auto] sm:gap-x-4 sm:gap-y-3 sm:px-6 sm:pt-7 lg:items-start lg:gap-x-6 hd:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] hd:gap-y-0 xl:gap-x-10">
        <nav
          aria-label="Main"
          className="col-start-1 row-start-1 flex min-w-0 w-full max-w-full flex-nowrap justify-center gap-2.5 overflow-x-auto overscroll-x-contain text-base justify-self-center sm:col-span-2 sm:row-start-2 hd:col-span-1 hd:col-start-2 hd:row-start-1 hd:self-center hd:items-center hd:justify-center hd:overflow-visible"
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

        <div className="col-start-1 row-start-2 flex w-full min-w-0 flex-col space-y-2 max-sm:pl-[calc(0.75rem+1px)] sm:col-start-1 sm:row-start-1 sm:max-w-md sm:justify-self-start md:max-w-lg lg:max-w-3xl lg:w-full hd:col-start-1 hd:row-start-1 xl:max-w-4xl">
          <span className="block shrink-0 text-4xl font-semibold tracking-tight text-white sm:text-[clamp(1.5rem,4vw,2.25rem)]">
            CS Practice Room
          </span>
          <p className="shrink-0 text-base leading-snug text-neutral-300 max-sm:whitespace-nowrap max-sm:overflow-x-auto max-sm:pb-0.5 md:text-lg">
            Booking, Jam Reservations, and Student Support.
          </p>
        </div>

        <div className="col-start-1 row-start-3 flex w-full justify-center sm:col-start-2 sm:row-start-1 sm:w-auto sm:justify-end sm:justify-self-end sm:self-start hd:col-start-3 hd:row-start-1">
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
