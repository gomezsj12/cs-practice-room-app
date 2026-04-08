import { siteConfig } from "@/lib/siteConfig";

export default function BookingPage() {
  const hasEmbedUrl = Boolean(siteConfig.filloutUrl);

  return (
    <main className="px-4 py-8 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-blue-300">
            Practice Room Booking
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Use the official booking form.
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-300">
            This page embeds the current Fillout booking form inside the practice-room
            app so students can stay inside the same experience.
          </p>
        </section>

        {hasEmbedUrl ? (
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-black/20">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm text-neutral-300">
              <p>If the form does not load well here, you can open it in a new tab.</p>
              <a
                href={siteConfig.filloutUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white transition hover:border-white/20 hover:bg-white/10"
              >
                Open in new tab
              </a>
            </div>
            <iframe
              src={siteConfig.filloutUrl}
              title="CS Practice Room booking form"
              className="min-h-[1100px] w-full bg-transparent"
            />
          </section>
        ) : (
          <section className="rounded-3xl border border-dashed border-white/15 bg-black/20 p-6">
            <h2 className="text-xl font-semibold">Fillout link still needed</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-300">
              Add `NEXT_PUBLIC_FILLOUT_URL` in local environment variables and in
              Vercel project settings, then this page will render the embedded form.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
