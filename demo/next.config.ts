import type { NextConfig } from "next";

// Who may frame the chrome-free /embed/* widgets. Default "*" (any site can embed, like a public
// widget); set EMBED_FRAME_ANCESTORS to a space-separated origin list to lock it to named partners.
// 'self' is always included so the landing gallery's same-origin preview iframes keep working even
// when an allowlist is set. Scoped to /embed only — a global frame-ancestors would intersect with
// this and silently neutralize the allowlist, and the rest of the app should not be framable.
const FRAME_ANCESTORS = `'self' ${process.env.EMBED_FRAME_ANCESTORS ?? "*"}`;

const nextConfig: NextConfig = {
  output: "standalone",
  // The "How it works" explainer is now folded into /docs; keep old deep links working.
  async redirects() {
    return [{ source: "/demos/explainer", destination: "/docs", permanent: true }];
  },
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: [
          { key: "Content-Security-Policy", value: `frame-ancestors ${FRAME_ANCESTORS};` },
        ],
      },
    ];
  },
};

export default nextConfig;
