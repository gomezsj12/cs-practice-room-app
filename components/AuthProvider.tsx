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
 * over every page.
 *
 * @see next-auth/react — session context consumed by AuthButton, CalendarView, SupportInbox, etc.
 * @see AccountSetupModal — first-time account setup overlay
 */

import { SessionProvider } from "next-auth/react";
import AccountSetupModal from "@/components/AccountSetupModal";

/**
 * Provides the NextAuth session context to the component tree and
 * renders the first-time account-setup modal when needed.
 *
 * @param props.children - Application components that may consume `useSession()`.
 */
export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      {children}
      <AccountSetupModal />
    </SessionProvider>
  );
}