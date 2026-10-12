import type { MetadataRoute } from "next";

import { site } from "@/lib/site";

export const dynamic = "force-static";

const PATHS = ["", "/changelog", "/terms", "/privacy"] as const;

const sitemap = (): MetadataRoute.Sitemap =>
  PATHS.map((path) => ({ url: `${site.url}${path}` }));

export default sitemap;
