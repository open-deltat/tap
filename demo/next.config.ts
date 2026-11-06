import type { NextConfig } from "next";

// Who may frame the chrome-free /embed/* widgets. Default "*" (any site can embed, like a public
// widget); set EMBED_FRAME_ANCESTORS to a space-separated origin list to lock it to named partners.
// 'self' is always included so the landing gallery's same-origin preview iframes keep working even
// when an allowlist is set. Scoped to /embed only, since a global frame-ancestors would intersect
// with this and silently neutralize the allowlist, and the rest of the app should not be framable.
const FRAME_ANCESTORS = `'self' ${process.env.EMBED_FRAME_ANCESTORS ?? "*"}`;

const nextConfig: NextConfig = {
  output: "standalone",
  // The examples (components + their "use server" actions) live in a workspace package. Next only
  // honors the "use server"/"use client" directives in packages it transpiles, so this is required.
  transpilePackages: ["@open-deltat/examples"],
  // Retired pages keep their old links working: the "How it works" explainer and "What is TAP"
  // folded into the docs, and the Postgres-comparison essay gave way to the agent-first docs.
  async redirects() {
    return [
      { source: "/demos/explainer", destination: "/docs", permanent: true },
      { source: "/docs/sdk", destination: "/docs/protocol-and-engine", permanent: true },
      { source: "/docs/guides/scheduling-database", destination: "/docs", permanent: true },
    ];
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
