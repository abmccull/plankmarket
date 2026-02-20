import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "utfs.io",
      },
      {
        protocol: "https",
        hostname: "uploadthing.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://connect-js.stripe.com https://us.i.posthog.com https://*.hcaptcha.com https://hcaptcha.com",
              "frame-src https://js.stripe.com https://hooks.stripe.com https://connect-js.stripe.com https://*.stripe.com https://*.stripe.network https://*.hcaptcha.com https://hcaptcha.com",
              "img-src 'self' https://utfs.io https://uploadthing.com https://*.supabase.co https://images.unsplash.com https://*.stripe.com data: blob:",
              "style-src 'self' 'unsafe-inline'",
              "connect-src 'self' https://*.supabase.co https://api.stripe.com https://connect.stripe.com https://connect-js.stripe.com https://*.stripe.network https://*.hcaptcha.com https://hcaptcha.com https://us.i.posthog.com wss://*.supabase.co",
              "font-src 'self'",
            ].join("; "),
          },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
