import Image from "next/image";

import type { Artwork } from "@/lib/art";

/**
 * A painting that fills its parent, behind the content. The parent needs
 * `relative isolate overflow-hidden`, and `scheme-dark` so the Geist tokens
 * on top of the painting take their dark values in both themes.
 */
export const Painting = ({
  artwork,
  className = "",
  priority = false,
  scrim = "bg-background-100/35",
}: {
  artwork: Artwork;
  className?: string;
  priority?: boolean;
  /** The layer between the painting and the text on it. */
  scrim?: string;
}) => (
  <div aria-hidden className="absolute inset-0 -z-10">
    <Image
      alt=""
      className={`object-cover ${className}`}
      fill
      placeholder="blur"
      priority={priority}
      sizes="100vw"
      src={artwork.image}
    />
    <div className={`absolute inset-0 ${scrim}`} />
  </div>
);

/** The museum label for a painting: title, painter and year. */
export const ArtLabel = ({
  artwork,
  className = "",
}: {
  artwork: Artwork;
  className?: string;
}) => (
  <a
    className={`text-gray-alpha-900 hover:text-gray-1000 font-mono text-[11px] tracking-[0.08em] uppercase transition-colors duration-150 ${className}`}
    href={artwork.href}
  >
    {artwork.title}, {artwork.artist}, {artwork.year}
  </a>
);
