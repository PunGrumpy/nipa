import type { MetadataRoute } from "next";

import { url } from "@/lib/url";

export const dynamic = "force-static";

const PATHS = ["", "/changelog", "/terms", "/privacy"] as const;

const sitemap = (): MetadataRoute.Sitemap =>
  PATHS.map((path) => ({ url: `${url}${path}` }));

export default sitemap;
