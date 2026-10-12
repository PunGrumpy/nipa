import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { fonts } from "@/lib/fonts";
import { site } from "@/lib/site";
import { url } from "@/lib/url";

import "./globals.css";

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { color: "#ffffff", media: "(prefers-color-scheme: light)" },
    { color: "#0a0a0a", media: "(prefers-color-scheme: dark)" },
  ],
};

export const metadata: Metadata = {
  alternates: {
    canonical: "./",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: site.name,
  },
  applicationName: site.name,
  authors: [site.author],
  creator: site.author.name,
  description: site.description,
  formatDetection: { telephone: false },
  keywords: [
    "nipa",
    "nipa-cli",
    "Nipa Cloud",
    "OpenStack",
    "Keystone",
    "Terraform",
    "MFA",
    "TOTP",
    "CLI",
  ],
  metadataBase: new URL(url),
  openGraph: {
    locale: "en_US",
    siteName: site.name,
    type: "website",
    url: "./",
  },
  publisher: site.author.name,
  robots: {
    follow: true,
    googleBot: {
      follow: true,
      index: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
    index: true,
  },
  title: {
    default: `${site.name}: the command-line interface for Nipa Cloud`,
    template: `%s · ${site.name}`,
  },
  twitter: {
    card: "summary_large_image",
    creator: site.author.x,
    site: site.author.x,
  },
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html className={fonts} lang="en">
    <body>{children}</body>
  </html>
);

export default RootLayout;
