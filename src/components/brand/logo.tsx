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
      viewBox="0 0 86 86"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Top plank (left-aligned) */}
      <rect x="0" y="0" width="52" height="22" rx="2" fill="#6B3A2A" />
      {/* Middle plank (shifted right) */}
      <rect x="22" y="32" width="54" height="22" rx="2" fill="#6B3A2A" />
      {/* Bottom plank (wider, slightly shifted) */}
      <rect x="8" y="64" width="76" height="22" rx="2" fill="#6B3A2A" />

      {/* Left-pointing arrow (between top and middle planks) */}
      <polygon points="0,27 18,15 18,39" fill="white" />
      <rect x="18" y="21" width="38" height="12" rx="1" fill="white" />

      {/* Right-pointing arrow (between middle and bottom planks) */}
      <rect x="22" y="53" width="44" height="12" rx="1" fill="white" />
      <polygon points="84,59 66,47 66,71" fill="white" />
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
