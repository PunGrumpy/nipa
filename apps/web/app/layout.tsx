import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { fonts } from "@/lib/fonts";
import { site } from "@/lib/site";
import { url } from "@/lib/url";

import "./globals.css";

export const metadata: Metadata = {
  description: site.description,
  metadataBase: new URL(url),
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
  <html className={fonts} lang="en">
    <body>{children}</body>
  </html>
);

export default RootLayout;
