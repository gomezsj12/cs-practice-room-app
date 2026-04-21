"use client";

/**
 * @module AuthProvider
 *
 * Thin wrapper around NextAuth's {@link SessionProvider} that marks the
 * boundary as a Client Component. Placed near the root layout so every
 * page can call `useSession()` without its own provider.
 *
 * Also mounts the {@link AccountSetupModal} so it renders globally — if
 * the session indicates `profileComplete === false`, the modal appears
 * over every page. Mounts {@link ProfilePresenceReporter} so signed-in clients
 * report foreground presence to Notion (see `POST /api/profile/presence`).
 *
 * @see next-auth/react — session context consumed by AuthButton, CalendarView, SupportInbox, etc.
 * @see AccountSetupModal — first-time account setup overlay
 */

import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import AccountSetupModal from "@/components/AccountSetupModal";
import ProfilePresenceReporter from "@/components/ProfilePresenceReporter";

/**
 * Provides the NextAuth session context to the component tree and
 * renders the first-time account-setup modal when needed.
 *
 * @param props.children - Application components that may consume `useSession()`.
 * @param props.session - Session from `auth()` in the root layout. When set (including
 *   `null` for signed-out), the client skips the initial "loading" state so the header
 *   auth card does not flash on navigation.
 */
export default function AuthProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  return (
    <SessionProvider session={session}>
      {children}
      <AccountSetupModal />
      <ProfilePresenceReporter />
    </SessionProvider>
  );
}