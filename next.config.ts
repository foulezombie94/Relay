import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
export default function config(phase: string): NextConfig {
  return {
    poweredByHeader: false,
    distDir: process.env.VERCEL === "1" || phase === PHASE_DEVELOPMENT_SERVER ? ".next" : ".next-production",
    turbopack: { root: process.cwd() },
    async headers() {
      return [
        {
          source: "/:path*",
          headers: [
            { key: "X-Content-Type-Options", value: "nosniff" },
            {
              key: "Referrer-Policy",
              value: "strict-origin-when-cross-origin",
            },
            { key: "X-Frame-Options", value: "DENY" },
          ],
        },
      ];
    },
  };
}
