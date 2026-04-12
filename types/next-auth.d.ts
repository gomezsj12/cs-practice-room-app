import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    profileComplete?: boolean;
    bookingAccess?: boolean;
    isAdmin?: boolean;
    /** ISO timestamp from `profiles.updated_at`; bumps on sync / profile edits. */
    profileUpdatedAt?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    profileComplete?: boolean;
    bookingAccess?: boolean;
    isAdmin?: boolean;
    profileUpdatedAt?: string;
  }
}
