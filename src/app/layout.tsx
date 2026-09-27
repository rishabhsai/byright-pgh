import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ByRight PGH",
  description: "Which small homes fit Pittsburgh's vacant public lots, today and under Bill 2025-1545.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-dvh overflow-hidden antialiased`}>
      <body className="h-dvh overflow-hidden">{children}</body>
    </html>
  );
}
