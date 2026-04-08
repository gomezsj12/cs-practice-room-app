import CalendarView from "@/components/CalendarView";

export default function JamPage() {
  return (
    <main className="px-4 py-8 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-blue-300">
            Jam Reservations
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Reserve open practice-room time for a jam.
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-300">
            This is the existing jam scheduler experience, now placed on its own
            route inside the broader practice-room app.
          </p>
        </section>

        <section id="jam-calendar">
          <CalendarView />
        </section>
      </div>
    </main>
  );
}
