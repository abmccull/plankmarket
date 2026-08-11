import type { NextConfig } from "next";

const scriptSources = [
  "'self'",
  "'unsafe-inline'",
  ...(process.env.NODE_ENV === "production" ? [] : ["'unsafe-eval'"]),
  "https://js.stripe.com",
  "https://connect-js.stripe.com",
  "https://us.i.posthog.com",
  "https://va.vercel-scripts.com",
].join(" ");

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
        hostname: "**.ufs.sh",
        pathname: "/f/**",
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
  async redirects() {
    return [
      // Old blog slugs that may have been crawled - redirect to closest match
      {
        source: "/blog/buying-flooring-lots-guide-for-retailers",
        destination: "/blog/flooring-lot-sizes-buying-guide",
        permanent: true,
      },
      {
        source: "/blog/what-is-flooring-lot-how-liquidation-lots-work",
        destination: "/blog/flooring-lot-sizes-buying-guide",
        permanent: true,
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
            // Next.js still emits inline bootstrap scripts. Keep unsafe-inline
            // scoped to scripts until the app adopts request nonces; eval and
            // unused third-party origins are intentionally not allowed.
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "object-src 'none'",
              "frame-ancestors 'none'",
              `script-src ${scriptSources}`,
              "script-src-attr 'none'",
              "frame-src https://js.stripe.com https://hooks.stripe.com https://connect-js.stripe.com https://*.stripe.com https://*.stripe.network",
              "img-src 'self' https://utfs.io https://uploadthing.com https://*.ufs.sh https://*.supabase.co https://images.unsplash.com https://*.stripe.com data: blob:",
              "style-src 'self' 'unsafe-inline'",
              "connect-src 'self' https://*.supabase.co https://api.stripe.com https://connect.stripe.com https://connect-js.stripe.com https://*.stripe.network https://utfs.io https://uploadthing.com https://*.ufs.sh https://us.i.posthog.com wss://*.supabase.co",
              "form-action 'self' https://*.stripe.com",
              "worker-src 'self' blob:",
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
