import { Geist, Geist_Mono, Newsreader } from "next/font/google";

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

const serif = Newsreader({
  axes: ["opsz"],
  display: "swap",
  subsets: ["latin"],
  variable: "--font-newsreader",
  weight: "variable",
});

export const fonts = [
  "font-sans [font-synthesis-weight:none]",
  sans.variable,
  mono.variable,
  serif.variable,
].join(" ");
