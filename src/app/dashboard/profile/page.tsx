import { requireAuth } from "@/features/auth/guards";
import type { Rider } from "@/features/community/actions/getRider";
import { AvatarUploader } from "@/features/users/components/avatarUploader";
import { ProfileFollowStats } from "@/features/users/components/profileFollowStats";
import { RiderDetailsEditor } from "@/features/users/components/riderDetailsEditor";
import { prisma } from "@/lib/prisma";

export default async function ProfilePage() {
  const session = await requireAuth();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      username: true,
      email: true,
      image: true,
      createdAt: true,
      role: true,
      banned: true,
      bio: true,
      location: true,
      bikeBrand: true,
      bikeModel: true,
      skillLevel: true,
      ridingStyles: true,
      yearsRiding: true,
      _count: { select: { followers: true, following: true } },
    },
  });

  const name = user?.name ?? session.user.name;
  const followersCount = user?._count.followers ?? 0;
  const followingCount = user?._count.following ?? 0;

  const rider: Rider = {
    name,
    username: user?.username ?? null,
    image: user?.image ?? null,
    createdAt: (user?.createdAt ?? new Date()).toISOString(),
    banned: user?.banned ?? null,
    role: user?.role ?? null,
    bio: user?.bio ?? null,
    location: user?.location ?? null,
    bikeBrand: user?.bikeBrand ?? null,
    bikeModel: user?.bikeModel ?? null,
    skillLevel: user?.skillLevel ?? null,
    ridingStyles: user?.ridingStyles ?? [],
    yearsRiding: user?.yearsRiding ?? null,
    followersCount,
    followingCount,
    isFollowing: false,
    isSelf: true,
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground">Manage your public profile</p>
      </div>

      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <AvatarUploader name={name} image={user?.image ?? null} />

        <div className="space-y-1">
          <p className="text-2xl font-semibold">{name}</p>
          {user?.username ? (
            <p className="text-muted-foreground">@{user.username}</p>
          ) : null}
          <p className="text-sm text-muted-foreground">{user?.email}</p>
          <ProfileFollowStats
            followersCount={followersCount}
            followingCount={followingCount}
          />
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <div className="mb-1">
          <h2 className="font-heading text-lg font-semibold">Rider details</h2>
          <p className="text-sm text-muted-foreground">
            Your bike, experience and riding styles shown on your public
            profile.
          </p>
        </div>
        <RiderDetailsEditor userId={session.user.id} rider={rider} />
      </div>
    </div>
  );
}
