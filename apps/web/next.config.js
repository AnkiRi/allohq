const { resolve } = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  transpilePackages: ["@allohq/ui", "@allohq/database", "@allohq/ecommerce-integrations"],
  experimental: {
    optimizePackageImports: ["@allohq/ui", "lucide-react"],
  },
  outputFileTracingIncludes: {
    "/api/**": [
      resolve(__dirname, "../../node_modules/.prisma/client/**"),
      resolve(__dirname, "../../node_modules/@prisma/client/**"),
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
      },
      {
        protocol: "https",
        hostname: "*.amazonaws.com",
      },
    ],
  },
};

module.exports = nextConfig;
