"use client";

import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ArrowUpRightIcon, NewspaperIcon } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getNews } from "../actions/getNews";
import type { NewsArticle } from "../types";

const PAGE_SIZE = 12;

export function NewsGrid() {
  const [visible, setVisible] = useState(PAGE_SIZE);

  const {
    data: articles = [],
    isLoading,
    isError,
  } = useQuery<NewsArticle[]>({
    queryKey: ["news"],
    queryFn: () => getNews(),
    staleTime: 1000 * 60 * 15,
  });

  if (isLoading) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeletons
          <Skeleton key={i} className="h-72 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Couldn't load the news right now. Please try again later.
      </p>
    );
  }

  if (articles.length === 0) {
    return (
      <EmptyState
        icon={NewspaperIcon}
        title="No articles available."
        description="New stories from the cycling world will show up here."
        className="py-16"
      />
    );
  }

  const [lead, ...rest] = articles;
  const shown = rest.slice(0, visible);
  const hasMore = rest.length > visible;

  return (
    <div className="space-y-6">
      <FeaturedCard article={lead} />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((article, index) => (
          <div
            key={article.id}
            className="duration-500 animate-in fade-in slide-in-from-bottom-2 fill-mode-both"
            style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
          >
            <NewsCard article={article} />
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
          >
            Load more articles
          </Button>
        </div>
      )}
    </div>
  );
}

function timeAgo(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return formatDistanceToNow(date, { addSuffix: true });
}

function FeaturedCard({ article }: { article: NewsArticle }) {
  const ago = timeAgo(article.publishedAt);
  return (
    <a
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block overflow-hidden rounded-2xl border border-primary/20"
    >
      <div className="relative aspect-[21/9] w-full bg-muted">
        {article.image ? (
          // biome-ignore lint/performance/noImgElement: external RSS thumbnails
          <img
            src={article.image}
            alt={article.title}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <NewspaperIcon className="size-12 text-muted-foreground/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
      </div>

      <div className="absolute right-0 bottom-0 left-0 p-5 text-white sm:p-6">
        <div className="mb-2 flex items-center gap-2 text-xs">
          <span className="rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground">
            {article.source}
          </span>
          {ago && <span className="text-white/70">{ago}</span>}
        </div>
        <h2 className="font-heading text-xl font-bold leading-tight sm:text-2xl">
          {article.title}
        </h2>
        {article.excerpt && (
          <p className="mt-2 line-clamp-2 max-w-3xl text-sm text-white/80">
            {article.excerpt}
          </p>
        )}
      </div>
    </a>
  );
}

function NewsCard({ article }: { article: NewsArticle }) {
  const ago = timeAgo(article.publishedAt);
  return (
    <a
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex h-full flex-col overflow-hidden rounded-2xl border bg-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {article.image ? (
          // biome-ignore lint/performance/noImgElement: external RSS thumbnails
          <img
            src={article.image}
            alt={article.title}
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <NewspaperIcon className="size-10 text-muted-foreground/40" />
          </div>
        )}
        <span className="absolute top-3 left-3 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
          {article.source}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-heading font-semibold leading-snug group-hover:text-primary">
          {article.title}
        </h3>
        {article.excerpt && (
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {article.excerpt}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between pt-2 text-xs text-muted-foreground">
          <span>{ago ?? ""}</span>
          <span className="flex items-center gap-1 font-medium text-primary">
            Read
            <ArrowUpRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
      </div>
    </a>
  );
}
