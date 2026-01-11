/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // ყველა API route
        source: "/api/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "*", // თუ გინდა, მერე შეცვლი კონკრეტულ domain-ზე
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,POST,OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
