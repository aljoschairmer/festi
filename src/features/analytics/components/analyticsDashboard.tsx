"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/lib/auth-client";
import { getAnalytics } from "../actions/getAnalytics";
import { TIME_RANGE_LABELS, type TimeRange, timeRangeSchema } from "../schemas";
import type { AnalyticsData } from "../types";
import { ActivityCharts } from "./activityCharts";
import { RecentActivityTable } from "./recentActivityTable";
import { StatCards } from "./statCards";
import { TopActors } from "./topActors";
import { WarningsPanel } from "./warningsPanel";

const RANGES: TimeRange[] = ["24h", "7d", "30d", "90d"];

export function AnalyticsDashboard() {
  const [range, setRange] = useState<TimeRange>("7d");

  const { data: session } = useSession();

  const { data, isLoading, isFetching, isError, refetch } =
    useQuery<AnalyticsData>({
      queryKey: ["admin-analytics", range],
      queryFn: () => getAnalytics(range),

      refetchInterval: 30_000,
      staleTime: 15_000,
    });

  const warningCount = data?.warnings.filter(
    (w) => w.id !== "all-clear",
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">
            {session?.user
              ? `Signed in as ${session.user.email}`
              : "Platform statistics and insights"}
            {data && (
              <>
                {" · "}
                Updated{" "}
                {new Date(data.generatedAt).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={range}
            onValueChange={(value) => setRange(timeRangeSchema.parse(value))}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r} value={r}>
                  {TIME_RANGE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Refresh"
          >
            <RefreshCwIcon className={isFetching ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      {isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-center text-destructive">
          Failed to load analytics. Try refreshing.
        </div>
      ) : (
        <>
          <StatCards stats={data?.stats} isLoading={isLoading} />

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="activity">Recent activity</TabsTrigger>
              <TabsTrigger value="warnings">
                Warnings
                {warningCount ? ` (${warningCount})` : ""}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <ActivityCharts
                isLoading={isLoading}
                activityByDay={data?.activityByDay ?? []}
                registrationsByDay={data?.registrationsByDay ?? []}
                eventsByAction={data?.eventsByAction ?? []}
              />
              <TopActors actors={data?.topActors} isLoading={isLoading} />
            </TabsContent>

            <TabsContent value="activity">
              <RecentActivityTable
                entries={data?.recentActivity}
                isLoading={isLoading}
              />
            </TabsContent>

            <TabsContent value="warnings">
              <WarningsPanel warnings={data?.warnings} isLoading={isLoading} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
