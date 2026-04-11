/**
 * @file NextAuth v5 configuration (root-level).
 *
 * Configures Google OAuth as the sole authentication provider with JWT-based
 * sessions (no database adapter needed).
 *
 * The `jwt` callback checks whether the user has a completed profile in
 * Supabase on every sign-in and session update, and determines admin status
 * from the `ADMIN_EMAILS` env var. The `session` callback exposes
 * `profileComplete`, booking access, and `isAdmin` so client components can
 * gate the account-setup modal, booking messaging, and admin features.
 *
 * Exports:
 * - `handlers` — `GET` / `POST` route handlers re-exported in
 *   `app/api/auth/[...nextauth]/route.ts`.
 * - `auth` — server-side session accessor used by API routes and middleware.
 * - `signIn` / `signOut` — action helpers consumed by client components.
 *
 * `trustHost: true` is required for deployments behind a reverse proxy
 * (Vercel) where the `Host` header may not match the OAuth callback URL.
 *
 * @see {@link @/app/api/auth/[...nextauth]/route} — mounts the handlers
 */

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAdminEmail } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: {
    strategy: "jwt",
  },
  trustHost: true,
  callbacks: {
    async jwt({ token, account, trigger }) {
      if (
        account ||
        trigger === "update" ||
        token.profileComplete === undefined ||
        token.bookingAccess === undefined
      ) {
        try {
          const supabase = getSupabaseAdmin();
          const { data } = await supabase
            .from("profiles")
            .select("id, notion_page_id")
            .eq("google_email", token.email!)
            .single();
          token.profileComplete = !!data;
          token.bookingAccess = !!data?.notion_page_id;
          token.isAdmin = isAdminEmail(token.email);
        } catch {
          token.profileComplete = false;
          token.bookingAccess = false;
          token.isAdmin = false;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.profileComplete = token.profileComplete;
      session.bookingAccess = token.bookingAccess;
      session.isAdmin = token.isAdmin;
      return session;
    },
  },
});