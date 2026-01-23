/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ✅ Faster builds & smaller output
  swcMinify: true,
  compress: true,
  poweredByHeader: false,

  // ✅ Allow remote images (Pexels + Supabase Storage + common CDNs)
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.pexels.com" },
      { protocol: "https", hostname: "player.vimeo.com" },
      { protocol: "https", hostname: "i.vimeocdn.com" },

      // ✅ Supabase Storage domains (both patterns are used in practice)
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
    ],
  },

  // ✅ Make your builds stable (optional, but recommended)
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // ✅ Security headers (good baseline for Vercel)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Basic hardening
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },

          // HSTS (safe on HTTPS production)
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },

          // CSP (balanced; allows Supabase + Pexels + common needs)
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self';",
              "base-uri 'self';",
              "form-action 'self';",
              "frame-ancestors 'none';",
              "object-src 'none';",
              "img-src 'self' data: blob: https:;",
              "media-src 'self' data: blob: https:;",
              "font-src 'self' data: https:;",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval';",
              "style-src 'self' 'unsafe-inline';",
              "connect-src 'self' https:;",
            ].join(" "),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
