import type { MetadataRoute } from "next";

import { site } from "@/lib/site";

// The site is a static export, so the build writes the file once.
export const dynamic = "force-static";

const robots = (): MetadataRoute.Robots => ({
  rules: { allow: "/", userAgent: "*" },
  sitemap: `${site.url}/sitemap.xml`,
});

export default robots;
