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
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=()",
      },
      {
        key: "Content-Security-Policy",
        value:
          "frame-ancestors 'self' https://admin.shopify.com https://*.myshopify.com; object-src 'none'; base-uri 'self'",
      },
    ];
    if (process.env.NODE_ENV === "production") {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }
    return [{ source: "/(.*)", headers }];
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
