import type { MetadataRoute } from "next";

import { site } from "@/lib/site";

export const dynamic = "force-static";

const manifest = (): MetadataRoute.Manifest => ({
  background_color: "#0a0a0a",
  description: site.description,
  display: "standalone",
  icons: [
    { sizes: "any", src: "/icon.svg", type: "image/svg+xml" },
    { sizes: "180x180", src: "/apple-icon", type: "image/png" },
  ],
  lang: "en",
  name: `${site.name}: ${site.tagline}`,
  short_name: site.name,
  start_url: "/",
  theme_color: "#0a0a0a",
});

export default manifest;
