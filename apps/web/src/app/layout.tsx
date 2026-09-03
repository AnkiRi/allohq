import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { TRPCProvider } from "@/lib/trpc-provider";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider, ThemeScript } from "@/components/theme/ThemeProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "joon · retention, handled",
  description:
    "joon runs retention and first-line customer service for consumer brands, and only gets paid when it works.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shopifyApiKey = process.env.SHOPIFY_API_KEY;
  const apiOrigin = process.env.NEXT_PUBLIC_API_URL;

  return (
    <ClerkProvider>
      <html
        lang="en"
        suppressHydrationWarning
        className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      >
        <head>
          {shopifyApiKey ? (
            <>
              <meta name="shopify-api-key" content={shopifyApiKey} />
              {apiOrigin ? <meta name="shopify-app-origins" content={apiOrigin} /> : null}
              {/* Shopify requires App Bridge before every other script. The CDN
                  bootstrap supplies fresh ID tokens and embedded navigation. */}
              <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
            </>
          ) : null}
          <ThemeScript />
        </head>
        <body>
          <ThemeProvider>
            <TRPCProvider>
              <ToastProvider>{children}</ToastProvider>
            </TRPCProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
