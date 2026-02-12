"use client";

import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface FieldHintProps {
  hint: string;
}

export function FieldHint({ hint }: FieldHintProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          type="button"
          className="inline-flex items-center justify-center rounded-full hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={hint}
        >
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs">{hint}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
