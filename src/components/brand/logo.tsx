import { useId } from "react";
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
  const maskId = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 86 86"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <mask id={maskId}>
          {/* White = visible, black = transparent */}
          <rect width="86" height="86" fill="white" />

          {/* Left-pointing arrow cutout (between plank 1 and 2) */}
          <polygon points="0,27 16,15 16,39" fill="black" />
          <rect x="16" y="19" width="38" height="16" rx="1" fill="black" />

          {/* Right-pointing arrow cutout (between plank 2 and 3) */}
          <rect x="24" y="51" width="42" height="16" rx="1" fill="black" />
          <polygon points="86,59 70,47 70,71" fill="black" />
        </mask>
      </defs>

      <g mask={`url(#${maskId})`}>
        {/* Three staggered planks — matching reference design */}
        <rect x="0" y="0" width="54" height="22" rx="3" fill="currentColor" />
        <rect x="20" y="32" width="54" height="22" rx="3" fill="currentColor" />
        <rect x="8" y="64" width="72" height="22" rx="3" fill="currentColor" />
      </g>
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
