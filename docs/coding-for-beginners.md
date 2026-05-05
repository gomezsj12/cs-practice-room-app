# CS Practice Room App — code map for beginners

This guide assumes you already know **what the app does** and **what the screens look like**. It connects those experiences to **folders, files, and tools** in this repo, using simple analogies.

---

## The big picture (like a restaurant)


| Real world                               | In this app                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| **Dining room** — what guests see        | **The website UI** — buttons, calendar, forms (`app/**/page.tsx`, `components/`*) |
| **Kitchen** — where work happens         | **The server** — APIs, database, Google Calendar (`app/api/`*, `lib/`*)           |
| **Recipe book** — rules everyone follows | **TypeScript** — names and shapes of data; catches mistakes before runtime        |
| **Storage room**                         | **Supabase** — saved data (profiles, holds, blocked times, quarters, …)           |
| **Delivery / landlord**                  | **Vercel** — runs the site on the internet at your URL                            |
| **ID check at the door**                 | **NextAuth + Google** — “who is this person?” and “can they book?”                |


You see the dining room. Most code is the kitchen and the recipe book.

---

## How the codebase is organized


| Path                      | Role                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `app/`                    | **Routes**: each URL. `page.tsx` = Homescreen Layout; `layout.tsx` wraps all screens; `api/**/route.ts` = server endpoints (JSON). |
| `components/`             | **Reusable UI** — header, calendar, modals, forms.                                                                        |
| `lib/`                    | **Shared logic** — Supabase, Google, Notion, date helpers, types.                                                         |
| `auth.ts`                 | **NextAuth** config (Google sign-in, session fields).                                                                     |
| `public/`                 | **Static files** served as-is.                                                                                            |
| `e2e/`                    | **Playwright** tests (including screenshot runs).                                                                         |
| `docs/guide-screenshots/` | **Reference screenshots** of the UI (used below).                                                                         |


---

## Tech stack (from `package.json`)

The main **dependencies** tell you what powers the app:

```json
{
  "next": "16.2.2",
  "react": "19.2.4",
  "react-dom": "19.2.4",
  "@supabase/supabase-js": "^2.101.1",
  "next-auth": "^5.0.0-beta.30",
  "googleapis": "^171.4.0",
  "@fullcalendar/react": "^6.1.20",
  "@fullcalendar/core": "^6.1.20",
  "@fullcalendar/interaction": "^6.1.20",
  "@fullcalendar/timegrid": "^6.1.20",
  "@notionhq/client": "^5.16.0",
  "@vercel/analytics": "^2.0.1",
  "date-fns": "^4.1.0",
  "date-fns-tz": "^3.2.0"
}
```

**Dev tooling:** TypeScript, ESLint, Tailwind CSS v4, Playwright.

---

## Home (`/`)

**What you see:** Hero (large screens), contact support, resources (guide, terms, Telegram, etc.).

**Where it lives:** `app/page.tsx` — server component; interactive pieces like `ContactSupportForm` are client components.

Desktop home

Mobile home

**Imports at the top of the homepage:**

```tsx
// app/page.tsx
import Link from "next/link";
import ContactSupportForm from "@/components/ContactSupportForm";
import { siteConfig } from "@/lib/siteConfig";

const cardClass =
  "rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20";
```

**Kid-friendly idea:** The page file is like a **menu** the server assembles; the contact form is a **waiter at the table** (needs to run in the browser).

**Site-wide copy and default URLs** live in one place:

```ts
// lib/siteConfig.ts
export const DEFAULT_FILLOUT_URL =
  "https://cspracticeroom.fillout.com/t/t1jM8vTCXtus";

export const siteConfig = {
  name: "CS Practice Room App",
  shortName: "Practice Room",
  description:
    "A shared home for practice-room booking, jam reservations, and future student support tools.",
  filloutUrl: process.env.NEXT_PUBLIC_FILLOUT_URL ?? DEFAULT_FILLOUT_URL,
  telegramContactUrl: process.env.NEXT_PUBLIC_TELEGRAM_CONTACT_URL ?? "",
  telegramGroupUrl: process.env.NEXT_PUBLIC_TELEGRAM_GROUP_URL ?? "",
};
```

---

## Root layout — shared chrome on every page

**What you see:** Header, sticky nav pills, dark background, PWA bits, analytics.

**Where it lives:** `app/layout.tsx`.

Desktop home with header

**The layout wraps every route** with auth, header, nav, children, service worker registration, install prompt, Vercel analytics:

```tsx
// app/layout.tsx
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
```

**Why Next.js:** One framework for **pages**, **API routes**, **metadata**, and **deployment** on Vercel.

---

## Calendar (`/calendar`)

**What you see:** Week or day time grid, practice and jam events, modals (reserve, details, cancel).

**Where it lives:**

- Shell: `app/calendar/page.tsx`
- Interactivity: `components/CalendarView.tsx` (FullCalendar + hooks)

Desktop calendar

Mobile calendar

Calendar modal (desktop)

**Page → component:**

```tsx
// app/calendar/page.tsx
import CalendarView from "@/components/CalendarView";

export default function CalendarPage() {
  return (
    <main className="px-4 pb-8 pt-5 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section id="practice-room-calendar">
          <CalendarView />
        </section>
      </div>
    </main>
  );
}
```

**Client component + FullCalendar** (browser-only: dragging, clicks, session):

```tsx
// components/CalendarView.tsx
"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DatesSetArg, EventContentArg } from "@fullcalendar/core";
import { addDays, format, parseISO } from "date-fns";
import FullCalendar from "@fullcalendar/react";
import interactionPlugin from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useSession } from "next-auth/react";
import BlockTimeModal from "@/components/BlockTimeModal";
// ... more imports
```

**Why FullCalendar:** A production-grade **schedule grid** (views, drag, touch) would be enormous to build from scratch — like using a **professional oven** instead of a camping stove.

**Data:** The UI calls `**GET /api/events`**. That route merges Google Calendar + Supabase (holds, blocks, Friday exceptions). The file header is the best summary:

```ts
// app/api/events/route.ts (file-level documentation)
/**
 * @file Calendar events API route (`GET /api/events`).
 *
 * Merges data sources into a unified response for the calendar UI:
 * 1. **Practice bookings** — events from the practice Google Calendar ...
 * 2. **Jam reservations** — events from the jam Google Calendar ...
 * 3. **Temporary holds** — pending rows from Supabase `reservation_holds` ...
 * 4. **Blocked times** — admin-created blocked periods from Supabase `blocked_times` ...
 * 5. **Friday exceptions** — dates from Supabase `friday_exceptions` ...
 *
 * All queries run in parallel via `Promise.all` to minimise latency.
 * Google Calendar and Supabase failures are handled independently so a
 * Supabase outage doesn't block calendar display.
 */
```

---

## Booking (`/booking`)

**What you see:** Embedded **Fillout** form (after sign-in / profile rules in the app).

**Where it lives:** `app/booking/page.tsx` + `components/BookingContent.tsx`.

Desktop booking

Mobile booking

**Server resolves the Fillout URL** (runtime env vars, no rebuild needed when staff change the form host in Vercel):

```tsx
// app/booking/page.tsx
import BookingContent from "@/components/BookingContent";
import { DEFAULT_FILLOUT_URL } from "@/lib/siteConfig";

function filloutBaseUrl(): string {
  return (
    process.env.FILLOUT_URL ??
    process.env.NEXT_PUBLIC_FILLOUT_URL ??
    DEFAULT_FILLOUT_URL
  );
}

export const dynamic = "force-dynamic";

export default function BookingPage() {
  return <BookingContent filloutBaseUrl={filloutBaseUrl()} />;
}
```

**Why embed Fillout:** Form fields and workflows can change in **Fillout** without redeploying the whole Next.js app for every tweak.

---

## Support (`/support`)

**What you see:** Thread list and conversation (layout adapts mobile vs desktop).

**Where it lives:** `app/support/page.tsx` + `components/SupportInbox.tsx` + `app/api/support/`*.

Desktop support

Mobile support

Support inbox (desktop)

```tsx
// app/support/page.tsx
import SupportInbox from "@/components/SupportInbox";

const cardClass =
  "border-0 bg-transparent p-0 shadow-none md:rounded-3xl md:border md:border-white/10 md:bg-white/5 md:p-6 md:shadow-2xl md:shadow-black/20";

export default function SupportPage() {
  return (
    <main className="px-4 pb-8 pt-5 text-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <section className={cardClass}>
          <SupportInbox />
        </section>
      </div>
    </main>
  );
}
```

---

## Next.js & React (short)

- `**app/` file routing:** `app/calendar/page.tsx` → URL `/calendar`.
- **Server components** (default): great for first paint and keeping secrets off the client.
- **Client components** (`"use client"`): needed for hooks, gestures, `useSession`, FullCalendar.
- **API routes:** `app/api/events/route.ts` → `**/api/events`** — small HTTP handlers that return JSON.

---

## TypeScript

JavaScript **runs** the app; TypeScript adds **types** so editors and `tsc` catch mistakes (wrong property names, missing fields) early. Shared shapes for API and DB rows live in `lib/types.ts` and next to routes.

---

## Supabase — database and server-side access

**Supabase** hosts **Postgres** and exposes APIs. This app uses a **server-only admin client** with the **service role** key (full access; never ship to the browser).

```ts
// lib/supabase.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabaseAdmin() {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !secretKey) {
      throw new Error("Missing Supabase environment variables.");
    }

    _client = createClient(url, secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return _client;
}
```

**Examples of tables** the code talks about: `profiles`, `reservation_holds`, `blocked_times`, `friday_exceptions`, `wwu_quarters` (see API comments and `lib/`).

---

## NextAuth + Google

**Sign in with Google** via NextAuth. After Google identifies the user, the `**jwt` callback** loads the `**profiles`** row from Supabase and sets `**bookingAccess`**, `**isAdmin**`, etc., on the session.

```ts
// auth.ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isEffectiveAppAdmin } from "@/lib/admin";
import { profileHasBookingAccess } from "@/lib/profile-access";
import { getSupabaseAdmin } from "@/lib/supabase";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: {
    strategy: "jwt",
  },
  trustHost: true,
  callbacks: {
    async jwt({ token, account, trigger }) {
      if (
        account ||
        trigger === "update" ||
        token.profileComplete === undefined ||
        token.bookingAccess === undefined ||
        token.isAdmin === undefined ||
        token.profileUpdatedAt === undefined
      ) {
        try {
          const supabase = getSupabaseAdmin();
          const { data } = await supabase
            .from("profiles")
            .select("id, notion_page_id, type, updated_at")
            .ilike("google_email", token.email!.trim())
            .single();
          token.profileComplete = !!data;
          token.bookingAccess = profileHasBookingAccess(
            data?.notion_page_id ?? null,
            data?.type ?? null,
          );
          token.isAdmin = isEffectiveAppAdmin(token.email, data?.type ?? null);
          token.profileUpdatedAt =
            typeof data?.updated_at === "string" ? data.updated_at : undefined;
        } catch {
          token.profileComplete = false;
          token.bookingAccess = false;
          token.isAdmin = false;
          token.profileUpdatedAt = undefined;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.profileComplete = token.profileComplete;
      session.bookingAccess = token.bookingAccess;
      session.isAdmin = token.isAdmin;
      session.profileUpdatedAt = token.profileUpdatedAt;
      return session;
    },
  },
});
```

`**trustHost: true**` helps OAuth callbacks work behind **Vercel’s** reverse proxy.

---

## Google Calendar

`**googleapis`** talks to **Google Calendar** with a **service account** (see `lib/google.ts`). Practice and jam calendars are read server-side and merged in `/api/events`.

---

## Notion

`**@notionhq/client`** and routes like `app/api/webhooks/notion/route.ts` sync **Notion** content (e.g. quarters, profiles) so staff can keep working in Notion while the app stays up to date.

---

## Vercel

**Hosting:** `next build` → deploy. **Secrets** (`SUPABASE_`*, Google creds, OAuth client secrets, …) live in the Vercel project’s environment settings.

`**@vercel/analytics`:** Optional traffic telemetry (wired in `app/layout.tsx`).

---

## PWA — install on home screen

`**app/manifest.ts`** defines name, colors, icons for “Add to Home Screen.”

```ts
// app/manifest.ts (excerpt — full file includes file header comment)
import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/siteConfig";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: siteConfig.shortName,
    description: siteConfig.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#030303",
    theme_color: "#030303",
    icons: [
      {
        src: "/api/pwa-icon?size=192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/api/pwa-icon?size=512",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/api/pwa-icon?size=512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
       },
       {
         src: "/api/pwa-icon?size=512",
         sizes: "512x512",
         type: "image/png",
         purpose: "maskable",
      },
    ],
  };
}
```

Icons are generated by `**/api/pwa-icon**` (see comment in that file) rather than committing many PNG sizes.

---

## Tailwind CSS

Styles use **utility classes** on `className` (e.g. `flex`, `rounded-3xl`, `bg-white/5`) via **Tailwind** — fast UI work without huge custom CSS files for every page.

---

## Playwright & screenshots

`**e2e/`** runs automated browsers. `**npm run screenshots:guide`** produces images in `**docs/guide-screenshots/**` (this doc uses some of those plus extras from `**docs/screenshots/**`).

---

## End-to-end: loading the calendar

1. You open `**/calendar**`.
2. `**CalendarView**` requests `**/api/events**` (with cookies/session).
3. `**app/api/events/route.ts**` runs on the server: `**auth()**`, date window (quarter vs rolling), then **parallel** fetches to **Google** and **Supabase**.
4. The API returns **one JSON payload** the calendar understands.
5. **FullCalendar** renders the grid and handles interaction.

**Analogy:** One **waiter** (the API) visits **two kitchens** (Google + Supabase) and brings back **one tray**.

---

## More reference images (`docs/screenshots/`)


| Screenshot            | Path                                    |
| --------------------- | --------------------------------------- |
| Desktop homepage full | `screenshots/desktop-homepage-full.png` |
| Desktop calendar full | `screenshots/desktop-calendar-full.png` |
| Desktop booking full  | `screenshots/desktop-booking-full.png`  |
| Tablet homepage       | `screenshots/tablet-homepage-full.png`  |


Open files under `docs/screenshots/` in your editor or image viewer to browse the full set.

---

## Where to go next

- Pick a screen you use daily → open the matching `app/**/page.tsx` → follow **imports** into `components/`.
- For **data flow**, search for `**/api/`** calls in components or read `app/api/*/route.ts` file headers.
- Read `**lib/types.ts`** for database/API shapes.

*This document is an orientation map, not an exhaustive inventory of every file.*
