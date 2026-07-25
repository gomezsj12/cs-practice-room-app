/**
 * Google Calendar API client factory.
 *
 * Authenticates via a service-account JWT (env vars) and exposes a
 * lazily-initialised Calendar v3 client shared across the server process.
 *
 * @see {@link ../lib/calendar-helpers.ts} for overlap checks that consume this client.
 */
import { google } from "googleapis";

/**
 * Build a service-account JWT for Google Calendar scope.
 * The private key in the env var uses literal `\n`; we normalise to real newlines.
 */
function getGoogleAuth() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  const projectId = process.env.GOOGLE_PROJECT_ID;

  if (!clientEmail || !privateKey || !projectId) {
    throw new Error("Missing Google service account environment variables.");
  }

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
}

/** Singleton: created on first call, reused for the lifetime of the process. */
let _calendar: ReturnType<typeof google.calendar> | null = null;

/**
 * Return a shared Google Calendar v3 client, creating it on first call.
 * Safe to call from any server-side code path.
 */
export function getCalendarClient() {
  if (!_calendar) {
    const auth = getGoogleAuth();
    _calendar = google.calendar({ version: "v3", auth });
  }

  return _calendar;
}