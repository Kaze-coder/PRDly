import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,

  // Allow external SVG tech icons from Simple Icons CDN.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.simpleicons.org" }],
  },

  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "react-markdown",
      "remark-gfm",
      "rehype-highlight",
    ],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
