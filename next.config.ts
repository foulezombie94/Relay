import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { withSentryConfig } from "@sentry/nextjs/config";
function config(phase: string): NextConfig {
  return {
    poweredByHeader: false,
    distDir: process.env.VERCEL === "1" ? ".next" : phase === PHASE_DEVELOPMENT_SERVER
      ? process.platform === "win32" ? ".next-local" : ".next"
      : process.platform === "win32" ? ".next-build" : ".next-production",
    turbopack: { root: process.cwd() },
    // Native SWC lock acquisition fails on this Windows runtime. Linux deployments retain it.
    experimental: { lockDistDir: process.platform !== "win32" },
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
export default process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(config,{
      org:process.env.SENTRY_ORG,project:process.env.SENTRY_PROJECT,
      authToken:process.env.SENTRY_AUTH_TOKEN,
      sourcemaps:{disable:!process.env.SENTRY_AUTH_TOKEN},
    })
  : config;
