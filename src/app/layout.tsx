import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import { DirectionProvider } from "@/components/direction-provider";
import { dirFor, isLocale, defaultLocale } from "@/i18n/config";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return {
    title: { default: t("appName"), template: `%s · ${t("appName")}` },
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const raw = await getLocale();
  const locale = isLocale(raw) ? raw : defaultLocale;
  const dir = dirFor(locale);

  return (
    <html lang={locale} dir={dir} className="h-full antialiased">
      <body className="min-h-full">
        <NextIntlClientProvider>
          <DirectionProvider dir={dir}>
            {children}
            <Toaster position={dir === "rtl" ? "top-left" : "top-right"} dir={dir} />
          </DirectionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
