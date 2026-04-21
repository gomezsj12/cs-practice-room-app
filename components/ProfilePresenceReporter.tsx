"use client";

import { useProfilePresence } from "@/hooks/useProfilePresence";

/** Mounts {@link useProfilePresence} once inside the session provider. */
export default function ProfilePresenceReporter() {
  useProfilePresence();
  return null;
}
