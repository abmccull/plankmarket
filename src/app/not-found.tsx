import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-muted to-muted/50 mb-6">
        <span className="text-4xl font-display font-bold text-muted-foreground/50">404</span>
      </div>
      <h1 className="text-2xl font-display font-bold mb-2">Page Not Found</h1>
      <p className="text-muted-foreground mb-6 text-center max-w-md">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link href="/">
        <Button variant="secondary">Go Home</Button>
      </Link>
    </div>
  );
}
