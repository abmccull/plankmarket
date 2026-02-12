import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const accentColors = {
  primary: {
    stripe: "bg-primary",
    iconBg: "bg-primary/10",
    iconText: "text-primary",
  },
  secondary: {
    stripe: "bg-secondary",
    iconBg: "bg-secondary/10",
    iconText: "text-secondary",
  },
  accent: {
    stripe: "bg-accent",
    iconBg: "bg-accent/20",
    iconText: "text-accent-foreground",
  },
  warning: {
    stripe: "bg-amber-500",
    iconBg: "bg-amber-500/10",
    iconText: "text-amber-600",
  },
};

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  trend?: {
    value: number;
    label: string;
  };
  accentColor?: keyof typeof accentColors;
  className?: string;
}

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  accentColor = "primary",
  className,
}: StatsCardProps) {
  const colors = accentColors[accentColor];
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className={cn("h-1", colors.stripe)} />
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {Icon && (
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", colors.iconBg)}>
            <Icon className={cn("h-4 w-4", colors.iconText)} />
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-display font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
        {trend && (
          <p
            className={cn(
              "text-xs mt-1",
              trend.value >= 0 ? "text-emerald-600" : "text-red-600"
            )}
          >
            {trend.value >= 0 ? "+" : ""}
            {trend.value}% {trend.label}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
