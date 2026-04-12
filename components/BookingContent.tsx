"use client";

/**
 * @module BookingContent
 *
 * Reactive client component for the `/booking` page. Uses `useSession()` to
 * immediately reflect session changes (e.g. after profile creation) without
 * needing a full page refresh.
 *
 * Three states:
 * 1. **Not ready** — user isn't signed in or profile isn't complete → sign-in prompt.
 * 2. **No booking access** — profile exists but no eligible Notion Type / page → "no access" message.
 * 3. **Ready** — profile with booking-eligible Type and people page → embedded Fillout form.
 * Until the iframe `load` event, `pointer-events: none` keeps parent-page scrolling
 *    responsive on mobile; after load, the embed behaves normally.
 *
 * @see {@link @/app/api/profile/me/route} — profile data endpoint
 * @see {@link @/app/booking/page} — passes `filloutBaseUrl` from server env
 */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { profileHasBookingAccess } from "@/lib/profile-access";
import type { ProfileRow } from "@/lib/types";

type State =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "no-access" }
  | { status: "error" }
  | { status: "ready"; formUrl: string };

function buildFormUrl(profile: ProfileRow, filloutBaseUrl: string): string {
  const params = new URLSearchParams({
    name: profile.display_name,
    wwu_email: profile.walla_walla_email,
    page_id: profile.notion_page_id ?? "",
    sj_band: profile.sj_band ?? "",
    type: profile.type ?? "",
    Vespers: String(profile.dept_vespers),
    Berean: String(profile.dept_berean),
    Nuestra: String(profile.dept_nuestra),
    Circle: String(profile.dept_circle),
    BOTBSJ: String(profile.dept_battle_springjam),
    Other: String(profile.dept_other),
    Mosaic: String(profile.dept_mosaic),
  });
  return `${filloutBaseUrl}?${params.toString()}`;
}

type Props = {
  filloutBaseUrl: string;
};

const IFRAME_POINTER_FALLBACK_MS = 20_000;

function BookingFormIframe({ formUrl }: { formUrl: string }) {
  const [pointerEnabled, setPointerEnabled] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setPointerEnabled(true);
    }, IFRAME_POINTER_FALLBACK_MS);
    return () => window.clearTimeout(id);
  }, [formUrl]);

  return (
    <iframe
      src={formUrl}
      title="CS Practice Room booking form"
      onLoad={() => setPointerEnabled(true)}
      onError={() => setPointerEnabled(true)}
      className={`h-full min-h-0 w-full flex-1 border-0 bg-transparent ${
        pointerEnabled ? "" : "pointer-events-none"
      }`}
    />
  );
}

export default function BookingContent({ filloutBaseUrl }: Props) {
  const { data: session, status: sessionStatus } = useSession();
  const [state, setState] = useState<State>({ status: "loading" });

  const isReady =
    sessionStatus === "authenticated" && session?.profileComplete === true;

  useEffect(() => {
    if (sessionStatus === "loading") {
      setState({ status: "loading" });
      return;
    }

    if (!isReady) {
      setState({ status: "unauthenticated" });
      return;
    }

    let cancelled = false;

    async function fetchProfile() {
      setState({ status: "loading" });
      try {
        const res = await fetch("/api/profile/me");
        if (!res.ok) {
          setState({ status: "error" });
          return;
        }
        const { profile } = (await res.json()) as { profile: ProfileRow };
        if (cancelled) return;

        if (!profileHasBookingAccess(profile.notion_page_id, profile.type)) {
          setState({ status: "no-access" });
        } else {
          setState({
            status: "ready",
            formUrl: buildFormUrl(profile, filloutBaseUrl),
          });
        }
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    }

    void fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [sessionStatus, isReady, filloutBaseUrl]);

  if (state.status === "loading") {
    return (
      <main className="px-4 pb-8 pt-5 text-white">
        <div className="mx-auto max-w-7xl">
          <section className="flex items-center justify-center rounded-3xl border border-white/10 bg-white/5 p-12 shadow-2xl shadow-black/20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
            <span className="ml-3 text-sm text-neutral-400">Loading...</span>
          </section>
        </div>
      </main>
    );
  }

  if (state.status === "unauthenticated") {
    return (
      <main className="px-4 pb-8 pt-5 text-white">
        <div className="mx-auto max-w-7xl">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20">
            <h2 className="text-2xl font-semibold">
              Sign in to book a practice
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-300">
              You need to be signed in with a completed profile to access the
              booking form. Use the sign-in button in the header to get started.
            </p>
          </section>
        </div>
      </main>
    );
  }

  if (state.status === "no-access") {
    return (
      <main className="px-4 pb-8 pt-5 text-white">
        <div className="mx-auto max-w-7xl">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-500/15">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-semibold">
                  Booking access not available
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-300">
                  Your account doesn&apos;t have booking form access yet (for
                  example, your role in our directory may not include booking).
                  To get access, please send us a{" "}
                  <a href="/" className="text-red-300 underline hover:text-red-200">
                    support request
                  </a>
                  .
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="px-4 pb-8 pt-5 text-white">
        <div className="mx-auto max-w-7xl">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20">
            <h2 className="text-2xl font-semibold">Something went wrong</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-300">
              We couldn&apos;t load your profile. Try refreshing the page, or
              contact support if the problem persists.
            </p>
          </section>
        </div>
      </main>
    );
  }

  const { formUrl } = state;

  return (
    <main className="px-4 pb-4 pt-5 text-white md:flex md:h-full md:min-h-0 md:flex-1 md:flex-col">
      <div className="mx-auto w-full max-w-7xl md:flex md:h-full md:min-h-0 md:flex-1 md:flex-col">
        <section
          id="booking-form"
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-white/10 bg-black/20 md:h-full md:min-h-0"
        >
          <div className="flex shrink-0 justify-end border-b border-white/10 bg-black/30 px-4 py-2.5">
            <a
              href={formUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
            >
              Open in browser
            </a>
          </div>

          <div className="flex min-h-0 flex-1 flex-col md:min-h-0 md:flex-1">
            <div
              className="
                h-[min(820px,88dvh)] w-full max-md:shrink-0 overflow-hidden rounded-none
                border-0 bg-transparent shadow-none
                md:flex md:h-full md:min-h-0 md:flex-1 md:flex-col
                md:min-h-[max(36rem,calc(100dvh-14rem))]
              "
            >
              <BookingFormIframe key={formUrl} formUrl={formUrl} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
