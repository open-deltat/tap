import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The "How it works" explainer is now folded into /docs; keep old deep links working.
  async redirects() {
    return [{ source: "/demos/explainer", destination: "/docs", permanent: true }];
  },
};

export default nextConfig;
