import * as React from "react";
import { cn } from "@/lib/utils";

export function VisuallyHidden({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("sr-only", className)} {...props}>
      {children}
    </span>
  );
}
