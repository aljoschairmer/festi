import { format } from "date-fns";
import { NewspaperIcon, PinIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ProNewsArticle } from "../types";

type StageNewsFeedProps = {
  /** Newest-first commentary articles for this stage. */
  articles: ProNewsArticle[];
  /** Shows the live indicator; the list itself is the same either way. */
  live?: boolean;
  className?: string;
};

/**
 * The stage's race-center commentary as a compact feed column next to the
 * map: newest entry on top, timestamps in the race-local clock, internal
 * scroll so the column never outgrows the map. During live coverage the SSE
 * snapshot keeps the list current; otherwise it's the archived commentary.
 */
export function StageNewsFeed({
  articles,
  live = false,
  className,
}: StageNewsFeedProps) {
  return (
    <Card className={cn("flex flex-col overflow-hidden", className)}>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <NewspaperIcon className="size-4" />
          Live feed
        </CardTitle>
        {live && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            Live
          </span>
        )}
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto max-lg:max-h-[420px]">
        {articles.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            The official race-center commentary appears here once the stage is
            underway.
          </p>
        ) : (
          articles.map((article) => (
            <div
              key={article.id}
              className="space-y-1 border-b pb-3 last:border-b-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {article.publishedAt && (
                  <span className="font-mono">
                    {format(new Date(article.publishedAt), "HH:mm")}
                  </span>
                )}
                {article.pinned && (
                  <Badge variant="outline" className="gap-1">
                    <PinIcon className="size-3" />
                    Pinned
                  </Badge>
                )}
              </div>
              <p className="text-sm font-medium leading-snug">
                {article.title}
              </p>
              {article.paragraphs.map((paragraph) => (
                <p
                  key={paragraph}
                  className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
