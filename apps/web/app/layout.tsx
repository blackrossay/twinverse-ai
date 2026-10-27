import type { Metadata } from "next";
import { Instrument_Serif, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import Header from "@/components/Header";
import MobileNav from "@/components/MobileNav";
import DemoReset from "@/components/DemoReset";
import "./globals.css";

const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-next-display",
  display: "swap",
});

const space = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-next-sans",
  display: "swap",
});

const jet = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-next-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "TWINVERSE AI", template: "%s · TWINVERSE AI" },
  description: "One identity. Multiple realities. Measurable outcomes.",
  applicationName: "TWINVERSE AI",
  keywords: ["digital twin", "AI council", "voice clone", "live twin", "decision support"],
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Twinverse" },
};

export const viewport = {
  themeColor: "#0A0A0A",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrument.variable} ${space.variable} ${jet.variable}`}>
      <body>
        <Suspense>
          <Header />
        </Suspense>
        {children}
        <MobileNav />
        <footer className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-6 pb-24 pt-6 text-xs text-zinc-400 md:pb-10">
          <span>TWINVERSE AI · twin perspectives are illustrative starting points — your call, always.</span>
          <DemoReset />
        </footer>
      </body>
    </html>
  );
}
