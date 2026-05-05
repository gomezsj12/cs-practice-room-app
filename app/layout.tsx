/**
 * @file Root layout for the CS Practice Room app.
 *
 * Wraps every page with the NextAuth session provider (`AuthProvider`), passing
 * the server session from `auth()` so the client session context starts resolved,
 * the shared site header, the PWA service-worker registration script, and
 * the native-style "Add to Home Screen" install prompt.
 *
 * Exports Next.js `metadata` (title, description, manifest link) and
 * `viewport` (dark theme colour) so they appear in the `<head>` of every page.
 *
 * @see {@link @/components/AuthProvider} — provides the NextAuth `SessionProvider`
 * @see {@link @/components/ServiceWorkerRegistration} — registers `/sw.js` on mount
 * @see {@link @/components/InstallPrompt} — PWA install banner (beforeinstallprompt)
 */

import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { auth } from "@/auth";
import AuthProvider from "@/components/AuthProvider";
import InstallPrompt from "@/components/InstallPrompt";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import SiteHeader from "@/components/SiteHeader";
import StickyNavPills from "@/components/StickyNavPills";
import { siteConfig } from "@/lib/siteConfig";
import "./globals.css";

export const metadata: Metadata = {
  title: siteConfig.name,
  description: siteConfig.description,
  applicationName: siteConfig.name,
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#030303",
  colorScheme: "dark",
};

/**
 * Root layout component rendered around every route.
 *
 * Uses `min-h-dvh` so the body stretches to the dynamic viewport height on
 * mobile (avoids the iOS Safari address-bar gap). The inner flex column lets
 * pages like `/booking` fill remaining vertical space for the Fillout iframe.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-dvh flex-col bg-[#030303] text-white">
        <AuthProvider session={session}>
          <SiteHeader />
          <StickyNavPills />
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          <ServiceWorkerRegistration />
          <InstallPrompt />
          <Analytics />
        </AuthProvider>
      </body>
    </html>
  );
}
