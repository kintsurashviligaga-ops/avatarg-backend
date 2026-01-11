/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // CORS only for API routes
        source: "/api/:path*",
        headers: [
          // IMPORTANT: do NOT use "*" if you use Authorization header
          {
            key: "Access-Control-Allow-Origin",
            value: process.env.FRONTEND_ORIGIN || "https://cloud.ai",
          },
          { key: "Vary", value: "Origin" },

          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization, X-Requested-With",
          },
          { key: "Access-Control-Allow-Credentials", value: "true" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
