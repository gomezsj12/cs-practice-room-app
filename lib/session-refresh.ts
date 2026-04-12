/**
 * Payload for `useSession().update(...)` so Auth.js issues **POST** `/session`
 * with a body. Calling `update()` with no arguments only **GET**s the session
 * and does not re-run the JWT callback with `trigger: "update"`, so flags like
 * `bookingAccess` stay stale after profile changes.
 *
 * @see https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/lib/actions/session.ts
 */
export const SESSION_JWT_REFRESH_PAYLOAD = {};
