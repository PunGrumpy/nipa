import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";

const sans = Geist({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-geist-sans",
  weight: "variable",
});

const mono = Geist_Mono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-geist-mono",
  weight: "variable",
});

const geistSerif = localFont({
  adjustFontFallback: "Times New Roman",
  display: "swap",
  src: "../node_modules/geist/dist/fonts/geist-serif/GeistSerifVF.woff2",
  variable: "--font-geist-serif",
  weight: "400",
});

export const fonts = [
  "font-sans [font-synthesis-weight:none]",
  sans.variable,
  mono.variable,
  geistSerif.variable,
].join(" ");
