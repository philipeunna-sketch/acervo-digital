import type { NextConfig } from "next";

/**
 * Security headers applied to every response.
 * `Content-Security-Policy` is intentionally strict: the app only talks to its
 * own origin plus the storage provider endpoints that are configured at runtime.
 */
const csp = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts; 'unsafe-inline' is required for
  // the App Router runtime and is mitigated by `frame-ancestors 'none'`.
  "script-src 'self' 'unsafe-inline' https://*.supabase.co",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https: blob:",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/api/health", destination: "/api/system/health", permanent: false },
    ];
  },
};

export default nextConfig;
