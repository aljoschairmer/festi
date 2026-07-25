"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  CameraIcon,
  Loader2Icon,
  LocateFixedIcon,
  MountainIcon,
  SparklesIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { cancelRouteGeneration } from "../actions/cancelRouteGeneration";
import { generateRoute } from "../actions/generateRoute";
import { getRouteGenerationStatus } from "../actions/getRouteGenerationStatus";
import { formatDistance, formatDuration, formatElevation } from "../lib/format";
import type { GeneratedRouteOption, MapDot, Waypoint } from "../types";
import { LocationSearch } from "./locationSearch";
import { RideMap } from "./rideMap";

const CATEGORIES = [
  { value: "road", label: "Road" },
  { value: "gravel", label: "Gravel" },
  { value: "mtb", label: "MTB" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

const ROUTE_COLORS = ["#ef4444", "#3b82f6", "#22c55e"];

/**
 * Landmark kinds that make good tour names, best first — a castle or
 * viewpoint names a tour better than a random piece of street art.
 */
const NAME_KIND_RANK = [
  "natural:peak",
  "historic:castle",
  "tourism:viewpoint",
  "natural:waterfall",
  "man_made:lighthouse",
  "man_made:windmill",
  "historic:ruins",
  "historic:monument",
  "tourism:attraction",
];

/**
 * Names a tour after a landmark near its halfway point ("Via Benther
 * Berg") — the place the loop is "about", like Komoot's tour titles.
 * Falls back to a character-based name when no highlight carries a name.
 */
function tourName(option: GeneratedRouteOption, taken: Set<string>): string {
  const halfM = option.route.distance / 2;
  const rank = (kind: string) => {
    const index = NAME_KIND_RANK.indexOf(kind);
    return index === -1 ? NAME_KIND_RANK.length : index;
  };
  const named = option.highlights
    .filter((highlight) => highlight.name)
    .sort(
      (a, b) =>
        rank(a.kind) - rank(b.kind) ||
        Math.abs(a.distanceAlongRouteM - halfM) -
          Math.abs(b.distanceAlongRouteM - halfM),
    );
  for (const highlight of named) {
    const name = `Via ${highlight.name}`.slice(0, 34);
    if (!taken.has(name)) {
      return name;
    }
  }

  const gainPerKm =
    option.route.elevationGain / Math.max(1, option.route.distance / 1000);
  const base =
    option.unpavedRatio >= 0.35
      ? "Gravel adventure"
      : gainPerKm >= 12
        ? "Hilly loop"
        : gainPerKm >= 6
          ? "Rolling loop"
          : "Easy spin";
  if (!taken.has(base)) {
    return base;
  }
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

/**
 * Komoot-style full-map route generator: pick a start by tapping the map,
 * using the browser location or searching — candidates are generated
 * immediately and drawn on the map, ready to compare and pick.
 */
export function RouteGeneratorMap() {
  const router = useRouter();
  const [start, setStart] = useState<Waypoint | null>(null);
  const [category, setCategory] = useState<Category>("gravel");
  const [distanceKm, setDistanceKm] = useState("40");
  const [preferScenic, setPreferScenic] = useState(true);
  const [eBike, setEBike] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [locating, setLocating] = useState(false);
  const requestKeyRef = useRef<string>(crypto.randomUUID());
  const activeJobRef = useRef<string | null>(null);

  const distanceValid =
    /^\d+$/.test(distanceKm) &&
    Number(distanceKm) >= 5 &&
    Number(distanceKm) <= 400;

  const submitMutation = useMutation({
    mutationFn: async (from: Waypoint) => {
      const result = await generateRoute({
        start: from,
        category,
        targetDistanceKm: Number(distanceKm),
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
    onSuccess: (result) => {
      activeJobRef.current = result.jobId;
      setJobId(result.jobId);
      setSelectedIndex(0);
    },
    onError: (error) => toast.error(error.message),
  });

  const statusQuery = useQuery({
    queryKey: ["route-generation", jobId],
    queryFn: () => getRouteGenerationStatus(jobId as string),
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 1000;
      if (!data.success) return false;
      return data.status.state === "PENDING" || data.status.state === "RUNNING"
        ? 1000
        : false;
    },
  });

  const statusData = statusQuery.data;
  useEffect(() => {
    if (statusData && !statusData.success) {
      toast.error(statusData.error);
      setJobId(null);
    }
  }, [statusData]);

  const status = statusData?.success ? statusData.status : null;
  const options: GeneratedRouteOption[] | null =
    status?.state === "SUCCEEDED" ? (status.options ?? null) : null;
  const generating =
    submitMutation.isPending ||
    (jobId !== null &&
      (!status || status.state === "PENDING" || status.state === "RUNNING"));

  /** Starts a fresh generation, cancelling whatever ran before. */
  const regenerate = (from: Waypoint | null = start) => {
    if (!from || !distanceValid) {
      return;
    }
    if (activeJobRef.current) {
      void cancelRouteGeneration(activeJobRef.current);
      activeJobRef.current = null;
    }
    requestKeyRef.current = crypto.randomUUID();
    setJobId(null);
    submitMutation.mutate(from);
  };

  const setStartAndGenerate = (waypoint: Waypoint) => {
    setStart(waypoint);
    regenerate(waypoint);
  };

  const useBrowserLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Your browser does not provide location access.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setStartAndGenerate({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        setLocating(false);
        toast.error("Could not read your location. Pick the start on the map.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const selected = options?.[selectedIndex] ?? null;

  const tourNames = useMemo(() => {
    const taken = new Set<string>();
    return (options ?? []).map((option) => {
      const name = tourName(option, taken);
      taken.add(name);
      return name;
    });
  }, [options]);

  const alternatives = useMemo(
    () =>
      (options ?? [])
        .map((option, index) => ({
          id: String(index),
          coordinates: option.route.coordinates,
        }))
        .filter((_, index) => index !== selectedIndex),
    [options, selectedIndex],
  );

  const highlightDots: MapDot[] = useMemo(
    () =>
      (selected?.highlights ?? []).slice(0, 25).map((highlight, index) => ({
        id: `hl-${index}`,
        lat: highlight.lat,
        lng: highlight.lng,
        color: "#eab308",
        radius: 5,
        title: highlight.name ?? highlight.kind,
      })),
    [selected],
  );

  const useRoute = () => {
    if (!jobId || !selected) {
      return;
    }
    const name = tourNames[selectedIndex] ?? "";
    router.push(
      `/dashboard/community-rides/new?genJob=${encodeURIComponent(jobId)}&genIndex=${selectedIndex}&genName=${encodeURIComponent(name)}`,
    );
  };

  return (
    <div className="relative h-[calc(100svh-6.5rem)] overflow-hidden rounded-xl border">
      <RideMap
        className="h-full"
        waypoints={start ? [start] : []}
        routeCoordinates={selected?.route.coordinates}
        alternatives={alternatives}
        onSelectAlternative={(id) => setSelectedIndex(Number(id))}
        dots={highlightDots}
        fitTo={selected?.route.coordinates ?? null}
        interactive
        onAddWaypoint={setStartAndGenerate}
      />

      {/* Floating control panel, Komoot-style on the left. */}
      <div className="absolute top-4 left-4 z-10 flex w-[min(22rem,calc(100%-2rem))] flex-col gap-3">
        <div className="flex flex-col gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
          <div className="flex items-center gap-2 text-sm font-medium">
            <SparklesIcon className="size-4 text-primary" />
            Route generator
          </div>

          <LocationSearch
            placeholder="Search a start place…"
            onSelect={(place) =>
              setStartAndGenerate({ lat: place.lat, lng: place.lng })
            }
          />

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={locating}
            onClick={useBrowserLocation}
          >
            {locating ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <LocateFixedIcon className="size-4" />
            )}
            Use my location
          </Button>

          <div className="flex items-center gap-2">
            <div className="flex flex-1 rounded-lg border p-0.5">
              {CATEGORIES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={cn(
                    "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                    category === item.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => {
                    setCategory(item.value);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Input
                className="h-8 w-16 text-right"
                inputMode="numeric"
                aria-label="Distance in kilometers"
                value={distanceKm}
                onChange={(event) => setDistanceKm(event.target.value)}
              />
              <span className="text-muted-foreground text-xs">km</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label
              htmlFor="genmap-scenic"
              className="flex cursor-pointer select-none items-center gap-2 text-xs"
            >
              <Checkbox
                id="genmap-scenic"
                checked={preferScenic}
                onCheckedChange={(value) => setPreferScenic(value === true)}
              />
              Scenic
            </label>
            <label
              htmlFor="genmap-ebike"
              className="flex cursor-pointer select-none items-center gap-2 text-xs"
            >
              <Checkbox
                id="genmap-ebike"
                checked={eBike}
                onCheckedChange={(value) => setEBike(value === true)}
              />
              E-bike
            </label>
            {start && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="ml-auto"
                disabled={!distanceValid || generating}
                onClick={() => regenerate()}
              >
                {generating ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <SparklesIcon className="size-4" />
                )}
                Update
              </Button>
            )}
          </div>

          {!start && (
            <p className="text-muted-foreground text-xs">
              Tap the map, search a place or use your location to set the start
              — routes appear right away.
            </p>
          )}
          {generating && (
            <p className="flex items-center gap-2 text-muted-foreground text-xs">
              <Loader2Icon className="size-3.5 animate-spin" />
              {status?.message ?? "Generating routes…"}
            </p>
          )}
        </div>

        {options && options.length > 0 && (
          <div className="flex flex-col gap-2">
            {options.map((option, index) => (
              <button
                key={`${option.route.routeGeometry.slice(0, 12)}-${index}`}
                type="button"
                className={cn(
                  "flex flex-col gap-1 rounded-xl border bg-background/95 p-3 text-left text-sm shadow-lg backdrop-blur transition-colors",
                  index === selectedIndex
                    ? "border-primary ring-1 ring-primary"
                    : "hover:border-primary/50",
                )}
                onClick={() => setSelectedIndex(index)}
              >
                <span className="flex items-center justify-between gap-2 font-medium">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="inline-block size-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          index === selectedIndex ? ROUTE_COLORS[0] : "#94a3b8",
                      }}
                    />
                    <span className="truncate">
                      {tourNames[index] ?? `Tour ${index + 1}`}
                    </span>
                  </span>
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
                      {option.highlights.length}
                    </span>
                  )}
                </span>
              </button>
            ))}

            <Button type="button" onClick={useRoute} disabled={!selected}>
              Use this route
              <ArrowRightIcon className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
