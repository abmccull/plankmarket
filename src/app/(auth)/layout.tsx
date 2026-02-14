import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Branded left panel — desktop only */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-primary to-secondary overflow-hidden">
        {/* Wood grain texture overlay */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `repeating-linear-gradient(
              90deg,
              transparent,
              transparent 20px,
              rgba(255,255,255,0.03) 20px,
              rgba(255,255,255,0.03) 21px
            ), repeating-linear-gradient(
              0deg,
              transparent,
              transparent 4px,
              rgba(255,255,255,0.02) 4px,
              rgba(255,255,255,0.02) 5px
            )`,
          }}
        />
        <div className="relative flex flex-col items-center justify-center w-full p-12 text-white">
          <Logo variant="full" size="xl" className="[&_span]:!text-white mb-8" />
          <h2 className="text-3xl font-display font-bold text-center mb-4">
            B2B Flooring Liquidation
          </h2>
          <p className="text-lg text-white/80 text-center max-w-md">
            Connect directly with verified flooring professionals.
            Trade overstock, discontinued, and closeout inventory.
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 bg-background">
        <Link href="/" className="lg:hidden mb-8">
          <Logo variant="full" size="lg" />
        </Link>
        <main id="main-content" className="w-full max-w-md">
          {children}
        </main>
      </div>
    </div>
  );
}
