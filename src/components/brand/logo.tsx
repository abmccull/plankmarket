import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "full" | "icon" | "wordmark";
  size?: "sm" | "md" | "lg" | "xl";
  theme?: "light" | "dark";
  className?: string;
}

const sizeMap = {
  sm: { icon: 24, text: "text-lg", gap: "gap-1.5" },
  md: { icon: 32, text: "text-xl", gap: "gap-2" },
  lg: { icon: 40, text: "text-2xl", gap: "gap-2.5" },
  xl: { icon: 48, text: "text-3xl", gap: "gap-3" },
};

function LogoIcon({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      {/* Three equal planks, same size, aligned left */}
      <rect x="0" y="0" width="80" height="18" rx="2" fill="currentColor" />
      <rect x="0" y="31" width="80" height="18" rx="2" fill="currentColor" />
      <rect x="0" y="62" width="80" height="18" rx="2" fill="currentColor" />

      {/* Left-pointing arrow (gap between plank 1 and 2) — planks extend past both sides */}
      <polygon points="6,27.5 18,20 18,35" fill="white" />
      <rect x="18" y="22" width="56" height="11" rx="1" fill="white" />

      {/* Right-pointing arrow (gap between plank 2 and 3) — planks extend past both sides */}
      <rect x="6" y="50" width="56" height="11" rx="1" fill="white" />
      <polygon points="74,55.5 62,48 62,63" fill="white" />
    </svg>
  );
}

function LogoWordmark({ className, theme = "light" }: { className?: string; theme?: "light" | "dark" }) {
  return (
    <span className={cn("font-bold leading-none", className)}>
      <span className={theme === "dark" ? "text-white" : "text-primary"}>Plank</span>
      <span className={theme === "dark" ? "text-green-300" : "text-secondary"}>Market</span>
    </span>
  );
}

export function Logo({ variant = "full", size = "md", theme = "light", className }: LogoProps) {
  const s = sizeMap[size];

  const iconColorClass = theme === "dark" ? "text-white" : "text-primary";

  if (variant === "icon") {
    return (
      <div className={className}>
        <LogoIcon size={s.icon} className={iconColorClass} />
      </div>
    );
  }

  if (variant === "wordmark") {
    return <LogoWordmark className={cn(s.text, className)} theme={theme} />;
  }

  return (
    <div className={cn("flex items-center", s.gap, className)}>
      <LogoIcon size={s.icon} className={iconColorClass} />
      <LogoWordmark className={s.text} theme={theme} />
    </div>
  );
}
