import Link from "next/link";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: {
    label: string;
    href: string;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="rounded-full bg-muted p-3 mb-3">
        <Icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <h4 className="font-medium text-sm mb-1">{title}</h4>
      <p className="text-sm text-muted-foreground max-w-[250px]">{description}</p>
      {action && (
        <Link href={action.href} className="mt-3">
          <Button size="sm" variant="outline">
            {action.label}
          </Button>
        </Link>
      )}
    </div>
  );
}
