import SupportInbox from "@/components/SupportInbox";

const cardClass =
  "rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20";

export default function SupportPage() {
  return (
    <main className="px-4 py-8 text-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <section className={cardClass}>
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-blue-300">
            Support
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Your support inbox
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-300">
            Staff replies from Telegram appear here. You can submit new requests
            from the Contact section on the homepage.
          </p>
        </section>

        <section className={cardClass}>
          <SupportInbox />
        </section>
      </div>
    </main>
  );
}
