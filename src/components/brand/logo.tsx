import Image from "next/image";
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
        <Image
          src="/logo-icon.png"
          alt="PlankMarket"
          width={s.icon}
          height={s.icon}
          className="object-contain"
          priority
        />
      </div>
    );
  }

  if (variant === "wordmark") {
    return <LogoWordmark className={cn(s.text, className)} />;
  }

  return (
    <div className={cn("flex items-center", s.gap, className)}>
      <Image
        src="/logo-icon.png"
        alt=""
        width={s.icon}
        height={s.icon}
        className="object-contain"
        priority
      />
      <LogoWordmark className={s.text} />
    </div>
  );
}
