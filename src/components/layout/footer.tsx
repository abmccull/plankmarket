"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { isPathWithin, isWorkspacePath } from "@/lib/workspace-navigation";

export function Footer() {
  const pathname = usePathname();
  const workspace = isWorkspacePath(pathname) && !isPathWithin(pathname, "/admin");
  const accountEntry = ["/register", "/login", "/forgot-password", "/reset-password", "/account-recovery"].includes(pathname);
  if (workspace || accountEntry) {
    return <footer className="border-t bg-background" aria-label={accountEntry ? "Account support and policies" : "Workspace footer"}>
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-x-6 px-6 py-2 text-xs text-muted-foreground lg:px-8">
        <p>&copy; {new Date().getFullYear()} PlankMarket</p>
        <nav aria-label={accountEntry ? "Account support links" : "Workspace support and policies"} className="flex flex-wrap gap-x-5">
          {[{ href: "/contact", title: "Help" }, { href: "/pricing", title: "Fees" }, { href: "/privacy", title: "Privacy" }, { href: "/terms", title: "Terms" }, { href: "/preferences", title: "Preferences" }].map((item) => <Link key={item.href} href={item.href} className="inline-flex min-h-11 min-w-11 items-center justify-center hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{item.title}</Link>)}
        </nav>
      </div>
    </footer>;
  }
  return (
    <footer className="border-t bg-gradient-to-b from-background to-muted/50">
      <div className="h-1 bg-gradient-to-r from-primary via-accent to-secondary" />
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          <div className="col-span-2 min-w-0 lg:col-span-1">
            <div className="mb-4">
              <Logo variant="full" size="md" />
            </div>
            <p className="text-sm text-muted-foreground">
              The B2B marketplace for liquidation, overstock, and closeout
              flooring inventory.
            </p>
          </div>

          <div>
            <h2 className="font-semibold mb-3 text-sm">For Buyers</h2>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/listings"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Browse Listings
                </Link>
              </li>
              <li>
                <Link
                  href="/register?role=buyer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Create Account
                </Link>
              </li>
              <li>
                <Link
                  href="/how-it-works"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  How It Works
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-semibold mb-3 text-sm">For Sellers</h2>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/register?role=seller"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Start Selling
                </Link>
              </li>
              <li>
                <Link
                  href="/seller-guide"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Seller Guide
                </Link>
              </li>
              <li>
                <Link
                  href="/pricing"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Pricing & Fees
                </Link>
              </li>
              <li>
                <Link
                  href="/tools/carrying-cost-calculator"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Carrying Cost Calculator
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-semibold mb-3 text-sm">Company</h2>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/about"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  About Us
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Contact
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t text-center">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} PlankMarket. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
