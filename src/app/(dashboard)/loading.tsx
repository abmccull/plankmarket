import { Logo } from "@/components/brand/logo";

export default function DashboardLoading() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center">
      <div className="animate-pulse mb-4">
        <Logo variant="icon" size="lg" />
      </div>
      <div className="h-1.5 w-48 rounded-full bg-muted overflow-hidden">
        <div className="h-full w-full bg-gradient-to-r from-primary to-secondary rounded-full animate-shimmer bg-[length:200%_100%]" />
      </div>
    </div>
  );
}
