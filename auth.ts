/**
 * @file NextAuth v5 configuration (root-level).
 *
 * Configures Google OAuth as the sole authentication provider with JWT-based
 * sessions (no database adapter needed).
 *
 * The `jwt` callback checks whether the user has a completed profile in
 * Supabase on every sign-in and session update. Booking access follows
 * Notion page id plus Type allowlist; admin is `ADMIN_EMAILS` or Notion
 * Type Leadership (see {@link profileHasBookingAccess}, {@link isEffectiveAppAdmin}).
 * The `session` callback exposes `profileComplete`, `bookingAccess`,
 * `isAdmin`, and `profileUpdatedAt` (Supabase `profiles.updated_at`) so
 * clients can refetch UI when the profile row changes without signing out.
 *
 * **Client `session.update()`:** In Auth.js, `update()` with **no argument**
 * only GETs the session and does **not** re-run the JWT callback with
 * `trigger: "update"`. Pass a payload (e.g. `{}` via `SESSION_JWT_REFRESH_PAYLOAD`
 * in `lib/session-refresh.ts`) so the client POSTs and Supabase profile fields
 * are re-read into the token.
 *
 * Exports:
 * - `handlers`: `GET` / `POST` route handlers re-exported in
 *   `app/api/auth/[...nextauth]/route.ts`.
 * - `auth`: server-side session accessor used by API routes and middleware.
 * - `signIn` / `signOut`: action helpers consumed by client components.
 *
 * `trustHost: true` is required for deployments behind a reverse proxy
 * (Vercel) where the `Host` header may not match the OAuth callback URL.
 *
 * @see {@link @/app/api/auth/[...nextauth]/route}: mounts the handlers
 */

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isEffectiveAppAdmin } from "@/lib/admin";
import { profileHasBookingAccess } from "@/lib/profile-access";
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
        token.bookingAccess === undefined ||
        token.isAdmin === undefined ||
        token.profileUpdatedAt === undefined
      ) {
        try {
          const supabase = getSupabaseAdmin();
          const { data } = await supabase
            .from("profiles")
            .select("id, notion_page_id, type, updated_at")
            .ilike("google_email", token.email!.trim())
            .single();
          token.profileComplete = !!data;
          token.bookingAccess = profileHasBookingAccess(
            data?.notion_page_id ?? null,
            data?.type ?? null,
          );
          token.isAdmin = isEffectiveAppAdmin(token.email, data?.type ?? null);
          token.profileUpdatedAt =
            typeof data?.updated_at === "string" ? data.updated_at : undefined;
        } catch {
          token.profileComplete = false;
          token.bookingAccess = false;
          token.isAdmin = false;
          token.profileUpdatedAt = undefined;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.profileComplete = token.profileComplete;
      session.bookingAccess = token.bookingAccess;
      session.isAdmin = token.isAdmin;
      session.profileUpdatedAt = token.profileUpdatedAt;
      return session;
    },
  },
});