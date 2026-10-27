import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import Header from "@/components/Header";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "TWINVERSE AI",
  description: "One identity. Multiple realities. Measurable outcomes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body>
        <Suspense>
          <Header />
        </Suspense>
        {children}
        <footer className="mx-auto max-w-5xl px-6 pb-10 pt-6 text-xs text-zinc-600">
          TWINVERSE AI · twin perspectives are illustrative starting points — your call, always.
        </footer>
      </body>
    </html>
  );
}
