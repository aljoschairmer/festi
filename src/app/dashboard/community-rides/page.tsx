import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getRides } from "@/features/rides/actions/getRides";
import { RideFilters } from "@/features/rides/components/rideFilters";

export default async function RidesPage() {
  const initialPage = await getRides();

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Community Rides</h1>
          <p className="text-muted-foreground">
            Plan new rides and join others on their adventures
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/community-rides/new">
            <PlusIcon className="size-4" />
            Create Ride
          </Link>
        </Button>
      </div>

      <RideFilters initialPage={initialPage} />
    </div>
  );
}
