import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is static, so the build writes plain files to `out/` and
  // Cloudflare serves them without a server.
  images: {
    // A static export has no server to resize images on request.
    unoptimized: true,
  },
  output: "export",
  reactStrictMode: true,
};

export default nextConfig;
