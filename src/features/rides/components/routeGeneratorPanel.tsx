"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CameraIcon,
  Loader2Icon,
  MountainIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cancelRouteGeneration } from "../actions/cancelRouteGeneration";
import { generateRoute } from "../actions/generateRoute";
import { getRouteGenerationStatus } from "../actions/getRouteGenerationStatus";
import { formatDistance, formatDuration, formatElevation } from "../lib/format";
import type { GeneratedRouteOption, PlaceResult } from "../types";

const CATEGORIES = [
  { value: "road", label: "Road" },
  { value: "gravel", label: "Gravel" },
  { value: "mtb", label: "MTB" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

/**
 * "Generate a route for me" — submits a roundtrip generation to the
 * route engine, streams progress by polling the status action and lets
 * the rider pick one of the returned candidates.
 */
export function RouteGeneratorPanel({
  start,
  onApply,
}: {
  start: PlaceResult;
  onApply: (
    option: GeneratedRouteOption,
    generation: { jobId: string; routeIndex: number },
  ) => void;
}) {
  const [category, setCategory] = useState<Category>("gravel");
  const [distanceKm, setDistanceKm] = useState("40");
  const [elevationTarget, setElevationTarget] = useState("");
  const [preferScenic, setPreferScenic] = useState(true);
  const [eBike, setEBike] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const requestKeyRef = useRef<string>(crypto.randomUUID());

  const submitMutation = useMutation({
    mutationFn: async () => {
      const result = await generateRoute({
        start: { lat: start.lat, lng: start.lng },
        category,
        targetDistanceKm: Number(distanceKm),
        targetElevationGainM:
          elevationTarget === "" ? undefined : Number(elevationTarget),
        preferScenic,
        eBike,
        numAlternatives: 3,
        requestKey: requestKeyRef.current,
      });
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: (result) => setJobId(result.jobId),
    onError: (error) => {
      requestKeyRef.current = crypto.randomUUID();
      toast.error(error.message);
    },
  });

  const statusQuery = useQuery({
    queryKey: ["route-generation", jobId],
    queryFn: () => getRouteGenerationStatus(jobId as string),
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 1200;
      if (!data.success) return false;
      return data.status.state === "PENDING" || data.status.state === "RUNNING"
        ? 1200
        : false;
    },
  });

  // Surface polling errors once and reset so the rider can retry.
  const statusData = statusQuery.data;
  useEffect(() => {
    if (statusData && !statusData.success) {
      toast.error(statusData.error);
      requestKeyRef.current = crypto.randomUUID();
      setJobId(null);
    }
  }, [statusData]);

  const status = statusData?.success ? statusData.status : null;
  const running =
    submitMutation.isPending ||
    (jobId !== null &&
      (!status || status.state === "PENDING" || status.state === "RUNNING"));
  const options = status?.state === "SUCCEEDED" ? (status.options ?? []) : null;
  const failed = status?.state === "FAILED" || status?.state === "CANCELLED";

  const distanceValid =
    /^\d+$/.test(distanceKm) &&
    Number(distanceKm) >= 5 &&
    Number(distanceKm) <= 400;

  const reset = () => {
    if (jobId && running) {
      void cancelRouteGeneration(jobId);
    }
    requestKeyRef.current = crypto.randomUUID();
    setJobId(null);
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <SparklesIcon className="size-4 text-primary" />
        Generate a route for me
      </div>

      {jobId === null && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="generator-category">Bike</Label>
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as Category)}
              >
                <SelectTrigger id="generator-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {CATEGORIES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="generator-distance">Distance (km)</Label>
              <Input
                id="generator-distance"
                inputMode="numeric"
                value={distanceKm}
                onChange={(event) => setDistanceKm(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="generator-elevation">
              Climbing target (m, optional)
            </Label>
            <Input
              id="generator-elevation"
              inputMode="numeric"
              placeholder="e.g. 600"
              value={elevationTarget}
              onChange={(event) => setElevationTarget(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label
              htmlFor="generator-scenic"
              className="flex cursor-pointer select-none items-center gap-2 text-sm"
            >
              <Checkbox
                id="generator-scenic"
                checked={preferScenic}
                onCheckedChange={(value) => setPreferScenic(value === true)}
              />
              Prefer scenic
            </label>
            <label
              htmlFor="generator-ebike"
              className="flex cursor-pointer select-none items-center gap-2 text-sm"
            >
              <Checkbox
                id="generator-ebike"
                checked={eBike}
                onCheckedChange={(value) => setEBike(value === true)}
              />
              E-bike
            </label>
          </div>

          <Button
            type="button"
            disabled={!distanceValid || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
          >
            {submitMutation.isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <SparklesIcon className="size-4" />
            )}
            Generate roundtrip
          </Button>
        </>
      )}

      {jobId !== null && running && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            {status?.message ?? "Submitting…"}
          </span>
          <Button type="button" variant="ghost" size="icon-sm" onClick={reset}>
            <XIcon className="size-4" />
          </Button>
        </div>
      )}

      {failed && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-destructive">
            {status?.errorDetail ?? "Generation failed. Please try again."}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={reset}>
            Try again
          </Button>
        </div>
      )}

      {options && jobId !== null && (
        <div className="flex flex-col gap-2">
          {options.map((option, index) => (
            <button
              key={`${option.route.routeGeometry.slice(0, 16)}-${index}`}
              type="button"
              className="flex flex-col gap-1 rounded-lg border bg-background p-3 text-left text-sm transition-colors hover:border-primary"
              onClick={() => {
                for (const warning of option.warnings) {
                  toast.warning(warning);
                }
                onApply(option, { jobId, routeIndex: index });
              }}
            >
              <span className="flex items-center justify-between font-medium">
                Option {index + 1}
                <span className="text-muted-foreground text-xs">
                  {Math.round(option.unpavedRatio * 100)}% unpaved
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-3 text-muted-foreground text-xs">
                <span>{formatDistance(option.route.distance)}</span>
                <span>{formatDuration(option.route.duration)}</span>
                <span className="flex items-center gap-1">
                  <MountainIcon className="size-3" />
                  {formatElevation(option.route.elevationGain)}
                </span>
                {option.highlights.length > 0 && (
                  <span className="flex items-center gap-1">
                    <CameraIcon className="size-3" />
                    {option.highlights.length} highlights
                  </span>
                )}
              </span>
            </button>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            Generate again
          </Button>
        </div>
      )}
    </div>
  );
}
