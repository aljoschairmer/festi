import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Prisma + the pg driver out of the server bundle so workerd resolves
  // their Cloudflare-specific exports (e.g. pg-cloudflare) at runtime instead
  // of esbuild trying (and failing) to bundle them.
  serverExternalPackages: [
    "@prisma/client",
    ".prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "pg-cloudflare",
  ],

  /**
   * Baseline security headers — the app shipped without any.
   *
   * The CSP is deliberately not the strictest possible one: Next injects
   * inline bootstrap scripts and Tailwind emits inline styles, and MapLibre
   * builds its workers from blob URLs. Tightening further needs nonces,
   * which is a separate piece of work; this already removes clickjacking,
   * MIME sniffing, referrer leakage and cross-origin script sources.
   */
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      // R2 media, MapTiler tiles and the article thumbnails in the news feed.
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            // Geolocation stays on: the route generator uses "use my location".
            value: "camera=(), microphone=(), payment=(), geolocation=(self)",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

// Enables the Cloudflare bindings/env locally when running `next dev`.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();
