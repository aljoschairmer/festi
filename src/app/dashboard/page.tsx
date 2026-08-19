import { requireAuth } from "@/features/auth/guards";
import { CreatePostForm } from "@/features/posts/components/createPostForm";
import { PostFeed } from "@/features/posts/components/postFeed";

export default async function DashboardPage() {
  const session = await requireAuth();

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome back, {session.user.name?.split(" ")[0] || "Rider"}!
          </h1>
          <p className="text-muted-foreground">
            Share an update and see what's new in the community
          </p>
        </div>

        <CreatePostForm
          authorName={session.user.name || "Rider"}
          authorImage={session.user.image ?? null}
        />
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            For You
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <PostFeed />
      </div>
    </div>
  );
}
