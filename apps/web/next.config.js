/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Hide the floating dev-indicator ("N" badge) — it overlapped landing content
  // on mobile during dev walks. (Dev-only; never shown in production.)
  devIndicators: false,
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: /node_modules/,
    };
    return config;
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
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
