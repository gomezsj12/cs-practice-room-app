import CalendarView from "@/components/CalendarView";

export default function JamPage() {
  return (
    <main className="px-4 py-8 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section id="jam-calendar">
          <CalendarView />
        </section>
      </div>
    </main>
  );
}
