import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreateGroupDialog } from "@/features/community/components/createGroupDialog";
import { GroupsGrid } from "@/features/community/components/groupsGrid";
import { RidersGrid } from "@/features/community/components/ridersGrid";

export default async function CommunityPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Riders</h1>
        <p className="text-muted-foreground">
          Connect with fellow cyclists in your area
        </p>
      </div>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>Rider Network</CardTitle>
          <CardDescription>
            Find and connect with other cyclists
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RidersGrid />
        </CardContent>
      </Card>
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-4">
            Rider Groups <CreateGroupDialog />
          </CardTitle>

          <CardDescription>Find and join rider groups</CardDescription>
        </CardHeader>
        <CardContent>
          <GroupsGrid />
        </CardContent>
      </Card>
    </div>
  );
}
