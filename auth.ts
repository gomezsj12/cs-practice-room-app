/**
 * @file NextAuth v5 configuration (root-level).
 *
 * Configures Google OAuth as the sole authentication provider with JWT-based
 * sessions (no database adapter needed).
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: {
    strategy: "jwt",
  },
  trustHost: true,
});