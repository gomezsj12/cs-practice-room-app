"use client";

/**
 * @module AuthProvider
 *
 * Thin wrapper around NextAuth's {@link SessionProvider} that marks the
 * boundary as a Client Component. Placed near the root layout so every
 * page can call `useSession()` without its own provider.
 *
 * @see next-auth/react — session context consumed by AuthButton, CalendarView, SupportInbox, etc.
 */

import { SessionProvider } from "next-auth/react";

/**
 * Provides the NextAuth session context to the component tree.
 *
 * @param props.children - Application components that may consume `useSession()`.
 */
export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionProvider>{children}</SessionProvider>;
}