import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, ArrowRight } from "lucide-react";
import type { BlogPostMeta } from "@/lib/blog";

const AUDIENCE_BADGE: Record<string, { variant: "info" | "warning" | "secondary"; label: string }> = {
  Sellers: { variant: "warning", label: "For Sellers" },
  Buyers: { variant: "info", label: "For Buyers" },
  Both: { variant: "secondary", label: "Industry Guide" },
};

export function PostCard({ post }: { post: BlogPostMeta }) {
  const badge = AUDIENCE_BADGE[post.audience] ?? AUDIENCE_BADGE.Both;

  return (
    <Link href={`/blog/${post.slug}`} className="group">
      <Card elevation="interactive" className="h-full flex flex-col">
        <CardContent className="flex-1 flex flex-col p-6">
          <div className="flex items-center gap-2 mb-3">
            <Badge variant={badge.variant}>{badge.label}</Badge>
            {post.type === "pillar" && (
              <Badge variant="gold">Guide</Badge>
            )}
          </div>
          <h3 className="font-display text-lg leading-snug mb-2 group-hover:text-primary transition-colors">
            {post.title}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-2 mb-4 flex-1">
            {post.description}
          </p>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {post.readingTime} min read
            </span>
            <span className="flex items-center gap-1 text-primary opacity-0 group-hover:opacity-100 transition-opacity">
              Read more <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
