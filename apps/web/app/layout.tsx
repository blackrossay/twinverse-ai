import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TWINVERSE AI",
  description: "One identity. Multiple realities. Measurable outcomes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
