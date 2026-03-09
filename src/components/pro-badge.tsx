import { cn } from "@/lib/utils";

interface ProBadgeProps {
  className?: string;
}

export function ProBadge({ className }: ProBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        "bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950",
        className
      )}
    >
      PRO
    </span>
  );
}
