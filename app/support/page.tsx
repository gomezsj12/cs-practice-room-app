import SupportInbox from "@/components/SupportInbox";

const cardClass =
  "border-0 bg-transparent p-0 shadow-none md:rounded-3xl md:border md:border-white/10 md:bg-white/5 md:p-6 md:shadow-2xl md:shadow-black/20";

export default function SupportPage() {
  return (
    <main className="px-4 py-8 text-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <section className={cardClass}>
          <SupportInbox />
        </section>
      </div>
    </main>
  );
}
