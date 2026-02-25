import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { TRPCProvider } from "@/lib/trpc-provider";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AlloHQ - E-Commerce Marketing Automation",
  description:
    "The most beautiful e-commerce marketing automation platform for DTC brands and Shopify stores",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={inter.className}>
          <TRPCProvider>
            <ToastProvider>{children}</ToastProvider>
          </TRPCProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
