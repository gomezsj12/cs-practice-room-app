"use client";

import { createContext, useContext } from "react";

export type AuthCardShortcutActions = {
  reloadProfile: () => void;
  signIn: () => void;
  signOut: () => void;
};

export const DEFAULT_AUTH_CARD_SHORTCUT_ACTIONS: AuthCardShortcutActions = {
  reloadProfile: () => {},
  signIn: () => {},
  signOut: () => {},
};

export const AuthCardShortcutActionsContext = createContext<AuthCardShortcutActions>(
  DEFAULT_AUTH_CARD_SHORTCUT_ACTIONS,
);

export function useAuthCardShortcutActions() {
  return useContext(AuthCardShortcutActionsContext);
}
