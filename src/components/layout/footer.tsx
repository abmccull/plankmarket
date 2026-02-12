import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export function Footer() {
  return (
    <footer className="border-t bg-gradient-to-b from-background to-muted/50">
      <div className="h-1 bg-gradient-to-r from-primary via-accent to-secondary" />
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <div className="mb-4">
              <Logo variant="full" size="md" />
            </div>
            <p className="text-sm text-muted-foreground">
              The B2B marketplace for liquidation, overstock, and closeout
              flooring inventory.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-3 text-sm">For Buyers</h4>
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
                  href="#"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  How It Works
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-3 text-sm">For Sellers</h4>
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
                  href="#"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Seller Guide
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Pricing & Fees
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-3 text-sm">Company</h4>
            <ul className="space-y-2">
              <li>
                <Link
                  href="#"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  About Us
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Contact
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="#"
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
