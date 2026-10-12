import type { StaticImageData } from "next/image";

import kauterskillClove from "@/assets/art/kauterskill-clove.jpg";
import lakeGeorge from "@/assets/art/lake-george.jpg";
import theOxbow from "@/assets/art/the-oxbow.jpg";

export interface Artwork {
  artist: string;
  href: string;
  image: StaticImageData;
  title: string;
  year: string;
}

const MET = "https://www.metmuseum.org/art/collection/search";

export const art = {
  kauterskillClove: {
    artist: "Sanford Robinson Gifford",
    href: `${MET}/10946`,
    image: kauterskillClove,
    title: "A Gorge in the Mountains (Kauterskill Clove)",
    year: "1862",
  },
  lakeGeorge: {
    artist: "John Frederick Kensett",
    href: `${MET}/11311`,
    image: lakeGeorge,
    title: "Lake George",
    year: "1869",
  },
  theOxbow: {
    artist: "Thomas Cole",
    href: `${MET}/10497`,
    image: theOxbow,
    title: "The Oxbow",
    year: "1836",
  },
} satisfies Record<string, Artwork>;

export const ARTWORKS: readonly Artwork[] = [
  art.lakeGeorge,
  art.theOxbow,
  art.kauterskillClove,
];
