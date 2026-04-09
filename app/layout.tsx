import type { Metadata, Viewport } from "next";
import AuthProvider from "@/components/AuthProvider";
import InstallPrompt from "@/components/InstallPrompt";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import SiteHeader from "@/components/SiteHeader";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-dvh flex-col bg-[#030303] text-white">
        <AuthProvider>
          <SiteHeader />
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          <ServiceWorkerRegistration />
          <InstallPrompt />
        </AuthProvider>
      </body>
    </html>
  );
}