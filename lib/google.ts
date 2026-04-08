import { google } from "googleapis";

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

let _calendar: ReturnType<typeof google.calendar> | null = null;

export function getCalendarClient() {
  if (!_calendar) {
    const auth = getGoogleAuth();
    _calendar = google.calendar({ version: "v3", auth });
  }

  return _calendar;
}