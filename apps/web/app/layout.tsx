import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { Suspense } from "react";
import Header from "@/components/Header";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "TWINVERSE AI",
  description: "One identity. Multiple realities. Measurable outcomes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.className}>
      <body>
        <Suspense>
          <Header />
        </Suspense>
        {children}
        <footer className="mx-auto max-w-5xl px-6 pb-10 pt-6 text-xs text-faint">
          TWINVERSE AI · simulated perspectives are illustrative starting points — your call, always.
        </footer>
      </body>
    </html>
  );
}
