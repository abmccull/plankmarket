import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
