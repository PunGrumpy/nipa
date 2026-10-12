import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import type { ReactNode } from "react";

import { site } from "@/lib/site";

import "./globals.css";

const geistSans = Geist({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const newsreader = Newsreader({
  axes: ["opsz"],
  display: "swap",
  subsets: ["latin"],
  variable: "--font-newsreader",
});

export const metadata: Metadata = {
  description: site.description,
  metadataBase: new URL(site.url),
  openGraph: {
    description: site.description,
    siteName: site.name,
    title: `${site.name}: ${site.tagline}`,
    type: "website",
  },
  title: `${site.name}: the command-line interface for Nipa Cloud`,
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { color: "#ffffff", media: "(prefers-color-scheme: light)" },
    { color: "#0a0a0a", media: "(prefers-color-scheme: dark)" },
  ],
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html
    className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable}`}
    lang="en"
  >
    <body className="font-sans">{children}</body>
  </html>
);

export default RootLayout;
