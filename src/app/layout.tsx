import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DM_Serif_Display } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { Providers } from "@/providers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
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

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://plankmarket.com";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "PlankMarket - B2B Wood Flooring Liquidation Marketplace",
    template: "%s | PlankMarket",
  },
  description:
    "The B2B marketplace connecting flooring manufacturers and distributors with retailers for liquidation, overstock, discontinued, and closeout inventory at wholesale prices.",
  keywords: [
    "flooring liquidation",
    "wholesale flooring",
    "B2B flooring marketplace",
    "surplus hardwood",
    "overstock flooring",
    "closeout flooring",
    "discontinued flooring",
    "flooring wholesale",
  ],
  openGraph: {
    type: "website",
    siteName: "PlankMarket",
    title: "PlankMarket - B2B Wood Flooring Liquidation Marketplace",
    description:
      "The B2B marketplace connecting flooring manufacturers and distributors with retailers for liquidation, overstock, discontinued, and closeout inventory at wholesale prices.",
  },
  twitter: {
    card: "summary_large_image",
    title: "PlankMarket - B2B Wood Flooring Liquidation Marketplace",
    description:
      "The B2B marketplace connecting flooring manufacturers and distributors with retailers for liquidation, overstock, discontinued, and closeout inventory at wholesale prices.",
  },
  robots: {
    index: true,
    follow: true,
  },
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "PlankMarket",
              url: BASE_URL,
              logo: `${BASE_URL}/logo.svg`,
              description:
                "B2B marketplace for surplus flooring materials connecting manufacturers, distributors, and retailers.",
              sameAs: [],
            }),
          }}
        />
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded focus:shadow-lg focus:outline-2 focus:outline-offset-2">
          Skip to main content
        </a>
        <Providers>
          <div className="flex min-h-screen flex-col">
            <Header />
            <div id="main-content" className="flex flex-1 flex-col">
              {children}
            </div>
            <Footer />
          </div>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
