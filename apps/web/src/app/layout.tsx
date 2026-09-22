import type { Metadata } from "next";
import localFont from "next/font/local";
import { ClerkProvider } from "@clerk/nextjs";
import { TRPCProvider } from "@/lib/trpc-provider";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider, ThemeScript } from "@/components/theme/ThemeProvider";
import "./globals.css";

/**
 * Fonts are served from this origin, not fetched from Google.
 *
 * `next/font/google` fetches at build time, and when Google was unreachable
 * from the builder the deploy failed inside Next's font loader with
 * `TypeError: Cannot read properties of null (reading '1')` — a null pointer
 * rather than anything about fonts. A deploy should not depend on a third party
 * answering.
 *
 * One variable file per family covers every weight: Google serves the same
 * variable font for each one, so asking for four weights was four copies of the
 * same file. `weight` is therefore a range, not a list.
 *
 * All three are SIL Open Font License 1.1. The licence and copyright notice
 * travel with the files in `public/fonts`, which is what the licence asks.
 */
const inter = localFont({
  src: "../../public/fonts/inter-variable.woff2",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = localFont({
  src: "../../public/fonts/space-grotesk-variable.woff2",
  weight: "300 700",
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "../../public/fonts/jetbrains-mono-variable.woff2",
  weight: "100 800",
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "joon · fewer, better emails",
  description:
    "Build and approve Shopify email campaigns and journeys, hold back a control, and measure what followed.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shopifyApiKey = process.env.SHOPIFY_API_KEY;
  const apiOrigin = process.env.NEXT_PUBLIC_API_URL;

  return (
    <ClerkProvider
      appearance={{
        elements: {
          cardBox: {
            backgroundColor: "#fffaf0",
          },
          socialButtonsBlockButton: {
            color: "#171412",
          },
        },
        variables: {
          colorBackground: "#fffaf0",
          colorText: "#171412",
          colorTextSecondary: "#58524b",
          colorPrimary: "#9a660e",
          colorTextOnPrimaryBackground: "#0e0e10",
          colorInputBackground: "#fffaf0",
          colorInputText: "#171412",
          colorNeutral: "#58524b",
          colorDanger: "#c8362c",
        },
      }}
    >
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
              {/* Joon obtains a fresh App Bridge ID token itself immediately
                  before each API call. Disable the CDN fetch interceptor so it
                  does not wrap the cross-origin API request a second time. */}
              <meta name="shopify-disabled-features" content="fetch" />
              {/* Shopify requires App Bridge before every other script. The CDN
                  bootstrap supplies fresh ID tokens and embedded navigation. */}
              {/* Load App Bridge only inside Shopify. Standalone agent.joonhq.com
                  sessions have no shop context and must not initialize it. */}
              <script
                dangerouslySetInnerHTML={{
                  __html:
                    'if(self!==top&&(new URLSearchParams(location.search).has("host")||new URLSearchParams(location.search).get("embedded")==="1")){document.write(\'<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"><\\/script>\')}',
                }}
              />
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
