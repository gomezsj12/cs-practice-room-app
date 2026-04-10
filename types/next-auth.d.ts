import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    profileComplete?: boolean;
    bookingAccess?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    profileComplete?: boolean;
    bookingAccess?: boolean;
  }
}
