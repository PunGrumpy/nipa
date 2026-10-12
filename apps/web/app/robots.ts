import type { MetadataRoute } from "next";

import { site } from "@/lib/site";

export const dynamic = "force-static";

const robots = (): MetadataRoute.Robots => ({
  rules: { allow: "/", userAgent: "*" },
  sitemap: `${site.url}/sitemap.xml`,
});

export default robots;
