export const siteConfig = {
  name: "CS Practice Room App",
  shortName: "Practice Room",
  description:
    "A shared home for practice-room booking, jam reservations, and future student support tools.",
  filloutUrl:
    process.env.NEXT_PUBLIC_FILLOUT_URL ?? "https://form.fillout.com/t/jVgTDpCFPAus",
  telegramContactUrl: process.env.NEXT_PUBLIC_TELEGRAM_CONTACT_URL ?? "",
  telegramGroupUrl: process.env.NEXT_PUBLIC_TELEGRAM_GROUP_URL ?? "",
};
