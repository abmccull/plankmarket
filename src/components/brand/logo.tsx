import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "full" | "icon" | "wordmark";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeMap = {
  sm: { icon: 24, text: "text-lg", gap: "gap-1.5" },
  md: { icon: 32, text: "text-xl", gap: "gap-2" },
  lg: { icon: 40, text: "text-2xl", gap: "gap-2.5" },
  xl: { icon: 48, text: "text-3xl", gap: "gap-3" },
};

function LogoIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Stacked planks */}
      <rect x="4" y="6" width="40" height="8" rx="2" fill="oklch(0.40 0.10 55)" />
      <rect x="4" y="18" width="40" height="8" rx="2" fill="oklch(0.45 0.08 55)" />
      <rect x="4" y="30" width="40" height="8" rx="2" fill="oklch(0.50 0.07 55)" />
      {/* B2B arrows */}
      <path
        d="M16 14 L24 10 L32 14"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M32 34 L24 38 L16 34"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Subtle wood grain lines */}
      <line x1="10" y1="10" x2="38" y2="10" stroke="oklch(0.50 0.08 55)" strokeWidth="0.5" opacity="0.3" />
      <line x1="10" y1="22" x2="38" y2="22" stroke="oklch(0.55 0.06 55)" strokeWidth="0.5" opacity="0.3" />
      <line x1="10" y1="34" x2="38" y2="34" stroke="oklch(0.60 0.05 55)" strokeWidth="0.5" opacity="0.3" />
    </svg>
  );
}

function LogoWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-bold leading-none", className)}>
      <span className="text-primary">Plank</span>
      <span className="text-secondary">Market</span>
    </span>
  );
}

export function Logo({ variant = "full", size = "md", className }: LogoProps) {
  const s = sizeMap[size];

  if (variant === "icon") {
    return (
      <div className={className}>
        <LogoIcon size={s.icon} />
      </div>
    );
  }

  if (variant === "wordmark") {
    return <LogoWordmark className={cn(s.text, className)} />;
  }

  return (
    <div className={cn("flex items-center", s.gap, className)}>
      <LogoIcon size={s.icon} />
      <LogoWordmark className={s.text} />
    </div>
  );
}
