import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DM_Serif_Display } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { Providers } from "@/providers";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const dmSerif = DM_Serif_Display({
  variable: "--font-dm-serif",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "PlankMarket - B2B Wood Flooring Liquidation Marketplace",
    template: "%s | PlankMarket",
  },
  description:
    "The B2B marketplace connecting flooring manufacturers and distributors with retailers for liquidation, overstock, discontinued, and closeout inventory at wholesale prices.",
  keywords: [
    "flooring",
    "liquidation",
    "wholesale",
    "B2B",
    "marketplace",
    "hardwood",
    "overstock",
    "closeout",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${dmSerif.variable} antialiased min-h-screen`}
      >
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded focus:shadow-lg focus:outline-2 focus:outline-offset-2">
          Skip to main content
        </a>
        <ErrorBoundary>
          <Providers>{children}</Providers>
        </ErrorBoundary>
        <Analytics />
      </body>
    </html>
  );
}
