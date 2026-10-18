import { locale as getLocaleParam } from "next/root-params";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import { routing } from "./routing";

const messages = { en, ar };

export default getRequestConfig(async ({ locale }) => {
  const requestedLocale = locale ?? (await getLocaleParam());

  if (!hasLocale(routing.locales, requestedLocale)) {
    notFound();
  }

  return {
    locale: requestedLocale,
    messages: messages[requestedLocale],
    timeZone: "Asia/Dubai",
    formats: {
      number: {
        standard: { numberingSystem: "latn" },
      },
    },
  };
});
