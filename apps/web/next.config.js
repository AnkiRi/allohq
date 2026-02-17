/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@allohq/ui", "@allohq/database", "@allohq/ecommerce-integrations"],
  experimental: {
    optimizePackageImports: ["@allohq/ui", "lucide-react"],
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
