import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
                <span className="text-xs font-bold text-primary-foreground">
                  PM
                </span>
              </div>
              <span className="font-bold">PlankMarket</span>
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
