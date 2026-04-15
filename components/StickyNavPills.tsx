"use client";

/**
 * @module StickyNavPills
 *
 * The sole visible navigation pills. The header's own nav pills are always
 * hidden via CSS; this component replaces them visually.
 *
 * Positioning uses two modes to avoid any JS-driven per-frame animation:
 *
 * - **Not stuck** (`position: absolute`): the container sits at the header
 *   nav's document position and scrolls with the page natively — the browser
 *   compositor handles this, so there is zero lag on fast or high-refresh
 *   scrolls.
 * - **Stuck** (`position: fixed`): once the scroll position reaches the
 *   stick point the container switches to `fixed` at the top of the
 *   viewport. Glass blur ramps in over the next ~80 px of travel.
 *
 * JS only runs to detect the switch point and update the blur variable;
 * it never sets `transform` or repositions the element per-frame.
 *
 * @see SiteHeader — the original header (never modified)
 * @see SupportNavLink — Support pill with unread indicator
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";
import SupportNavLink from "@/components/SupportNavLink";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/booking", label: "Booking" },
  { href: "/calendar", label: "Calendar" },
  { href: "/support", label: "Support" },
];

/** Inner nav padding-top from py-2.5 (10px). */
const NAV_PADDING_TOP_PX = 10;
/** Pixels of scrolling past the stick point to reach full glass blur. */
const FADE_DISTANCE_PX = 80;
const MAX_BLUR_PX = 12;

export default function StickyNavPills() {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const headerNav = document.querySelector<HTMLElement>(
      'nav[aria-label="Main"]',
    );
    if (!headerNav) return;

    const el = containerRef.current;
    if (!el) return;

    let navDocTop =
      headerNav.getBoundingClientRect().top + window.scrollY;
    let containerAbsTop = navDocTop - NAV_PADDING_TOP_PX;
    let stickPoint = containerAbsTop;
    let isFixed = false;

    headerNav.style.visibility = "hidden";
    el.style.position = "absolute";
    el.style.top = `${containerAbsTop}px`;
    el.style.opacity = "1";

    const pillLinks = el.querySelectorAll<HTMLElement>(
      "a.sticky-nav-pill, .sticky-nav-pill > a",
    );

    const setBlur = (value: string) => {
      pillLinks.forEach((a) => {
        a.style.backdropFilter = value;
        (a.style as unknown as Record<string, string>).webkitBackdropFilter =
          value;
      });
    };

    const update = () => {
      const scrollY = window.scrollY;
      const shouldFix = scrollY >= stickPoint;

      if (shouldFix !== isFixed) {
        isFixed = shouldFix;
        if (shouldFix) {
          el.style.position = "fixed";
          el.style.top = "0px";
        } else {
          el.style.position = "absolute";
          el.style.top = `${containerAbsTop}px`;
        }
      }

      if (shouldFix) {
        const scrollPast = scrollY - stickPoint;
        const progress = Math.min(
          1,
          Math.max(0, scrollPast / FADE_DISTANCE_PX),
        );
        setBlur(`blur(${Math.round(progress * MAX_BLUR_PX)}px)`);
      } else {
        setBlur("none");
      }
    };

    const onResize = () => {
      navDocTop =
        headerNav.getBoundingClientRect().top + window.scrollY;
      containerAbsTop = navDocTop - NAV_PADDING_TOP_PX;
      stickPoint = containerAbsTop;
      if (isFixed) {
        el.style.top = "0px";
      } else {
        el.style.top = `${containerAbsTop}px`;
      }
      update();
    };

    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    update();

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", onResize);
      headerNav.style.visibility = "";
    };
  }, []);

  return (
    <div
      ref={containerRef}
      data-testid="sticky-nav"
      className="fixed left-0 right-0 z-40 pointer-events-none opacity-0"
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 hd:grid hd:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <nav
          aria-label="Sticky"
          className="flex items-center justify-center gap-2.5 overflow-x-auto overscroll-x-contain py-2.5 text-base pointer-events-none hd:col-start-2"
        >
          {navItems.map((item) => {
            const isActive = pathname === item.href;

            if (item.href === "/support") {
              return (
                <span key={item.href} className="sticky-nav-pill shrink-0">
                  <SupportNavLink isActive={isActive} />
                </span>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sticky-nav-pill shrink-0 rounded-full border px-3 py-2 transition ${
                  isActive
                    ? "border-blue-400 bg-blue-500/15 text-blue-200"
                    : "border-white/20 bg-white/5 text-neutral-300 hover:border-white/35 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
