import type messages from "../../messages/en.json";
import type { Locale } from "@/i18n/config";

// Type-checks translation keys: t("dashboard.title") is checked against messages/en.json.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
