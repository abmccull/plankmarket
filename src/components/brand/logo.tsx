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
      {/* Top plank (left-aligned) */}
      <rect x="2" y="2" width="34" height="10" rx="1.5" fill="#6B3A2A" />
      {/* Left-pointing arrow */}
      <polygon points="2,14.5 10,10 10,19" fill="white" />
      <rect x="10" y="12.5" width="22" height="4" rx="0.5" fill="white" />
      {/* Middle plank (shifted right) */}
      <rect x="12" y="18" width="34" height="10" rx="1.5" fill="#6B3A2A" />
      {/* Right-pointing arrow */}
      <rect x="16" y="30.5" width="22" height="4" rx="0.5" fill="white" />
      <polygon points="46,32.5 38,28 38,37" fill="white" />
      {/* Bottom plank (slightly shifted) */}
      <rect x="6" y="36" width="38" height="10" rx="1.5" fill="#6B3A2A" />
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

  if (variant === "icon") {
    return (
      <div className={className}>
        <LogoIcon size={s.icon} />
      </div>
    );
  }

  if (variant === "wordmark") {
    return <LogoWordmark className={cn(s.text, className)} theme={theme} />;
  }

  return (
    <div className={cn("flex items-center", s.gap, className)}>
      <LogoIcon size={s.icon} />
      <LogoWordmark className={s.text} theme={theme} />
    </div>
  );
}
