/**
 * @file Shared navigation item definitions for the site header and sticky nav.
 *
 * Both {@link @/components/SiteHeader} and {@link @/components/StickyNavPills}
 * render pills from this array. Keeping a single source prevents the two
 * components from drifting out of sync.
 */

/** A single top-level navigation entry. */
export type NavItem = {
  href: string;
  label: string;
};

/** Ordered list of primary navigation pages. */
export const navItems: readonly NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/booking", label: "Booking" },
  { href: "/calendar", label: "Calendar" },
  { href: "/support", label: "Support" },
] as const;
