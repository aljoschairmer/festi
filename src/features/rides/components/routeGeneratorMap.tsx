"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  CameraIcon,
  ChevronDownIcon,
  ChevronUpIcon,
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { cancelRouteGeneration } from "../actions/cancelRouteGeneration";
import { generateRoute } from "../actions/generateRoute";
import { getRouteGenerationStatus } from "../actions/getRouteGenerationStatus";
import { formatDistance, formatDuration, formatElevation } from "../lib/format";
import { compassLabel, weatherEmoji } from "../lib/weather";
import type { GeneratedRouteOption, MapDot, Waypoint } from "../types";
import { LocationSearch } from "./locationSearch";
import { RideMap, type WeatherMarkerData } from "./rideMap";

const CATEGORIES = [
  { value: "road", label: "Road" },
  { value: "touring", label: "Touring" },
  { value: "gravel", label: "Gravel" },
  { value: "mtb", label: "MTB" },
  { value: "enduro", label: "Enduro" },
  { value: "cargo", label: "Cargo" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

const AVOID_OPTIONS = [
  { value: "highways", label: "Main roads" },
  { value: "high-traffic", label: "Traffic" },
  { value: "cobblestone", label: "Cobblestone" },
  { value: "ferries", label: "Ferries" },
  { value: "steps", label: "Steps" },
  { value: "tunnels", label: "Tunnels" },
] as const;

const ROUTE_COLORS = ["#ef4444", "#3b82f6", "#22c55e"];

/** Display names for the engine's semantic route labels. */
const LABEL_TEXT: Record<string, string> = {
  FASTEST: "Fastest",
  SHORTEST: "Shortest",
  QUIETEST: "Quietest",
  MOST_SCENIC: "Most scenic",
  FLATTEST: "Flattest",
  HILLIEST: "Hilliest",
  LEAST_HEADWIND: "Least headwind",
  CLEANEST_AIR: "Cleanest air",
};

/** Verbal rating for the European Air Quality Index. */
function aqiLabel(aqi: number): string {
  if (aqi <= 20) return "good";
  if (aqi <= 40) return "fair";
  if (aqi <= 60) return "moderate";
  if (aqi <= 80) return "poor";
  return "very poor";
}

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
  /** "roundtrip" loops back to the start; "atob" routes to a tapped end. */
  const [mode, setMode] = useState<"roundtrip" | "atob">("roundtrip");
  const [end, setEnd] = useState<Waypoint | null>(null);
  const [detourFactor, setDetourFactor] = useState("1.3");
  const [moreOpen, setMoreOpen] = useState(false);
  const [elevationTarget, setElevationTarget] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [surface, setSurface] = useState("");
  /** Traffic-stress ceiling as select value ("" = any, "2" = quiet, "1" = car-free). */
  const [maxTraffic, setMaxTraffic] = useState("");
  const [avoid, setAvoid] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [locating, setLocating] = useState(false);
  const requestKeyRef = useRef<string>(crypto.randomUUID());
  const activeJobRef = useRef<string | null>(null);

  const distanceValid =
    /^\d+$/.test(distanceKm) &&
    Number(distanceKm) >= 5 &&
    Number(distanceKm) <= 400;
  const elevationValid =
    elevationTarget === "" ||
    (/^\d+$/.test(elevationTarget) && Number(elevationTarget) <= 10000);

  const submitMutation = useMutation({
    mutationFn: async (points: { from: Waypoint; to: Waypoint | null }) => {
      const result = await generateRoute({
        start: points.from,
        end: points.to ?? undefined,
        category,
        targetDistanceKm: points.to ? undefined : Number(distanceKm),
        maxDetourFactor: points.to ? Number(detourFactor) : undefined,
        targetElevationGainM:
          elevationTarget === "" ? undefined : Number(elevationTarget),
        difficulty: difficulty === "" ? undefined : difficulty,
        surfacePreference: surface === "" ? undefined : surface,
        maxTrafficStress: maxTraffic === "" ? undefined : Number(maxTraffic),
        avoid: avoid.length > 0 ? avoid : undefined,
        preferScenic,
        eBike,
        numAlternatives: 5,
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
      return;
    }
    // A job can also end in FAILED or CANCELLED with a perfectly successful
    // *response*. Without this branch the spinner simply stopped and the
    // panel sat there empty, with no idea why nothing appeared.
    const state = statusData?.success ? statusData.status.state : null;
    if (state === "FAILED") {
      toast.error(
        statusData?.success
          ? (statusData.status.errorDetail ??
              statusData.status.message ??
              "The route generator could not build a route here.")
          : "The route generator could not build a route here.",
      );
      setJobId(null);
    } else if (state === "CANCELLED") {
      toast.info("Route generation was cancelled.");
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

  /**
   * Starts a fresh generation, cancelling whatever ran before. Points
   * are passed explicitly so a just-set start/end is never stale.
   */
  const regenerate = (
    from: Waypoint | null = start,
    to: Waypoint | null = mode === "atob" ? end : null,
  ) => {
    if (!from || !elevationValid) {
      return;
    }
    if (mode === "roundtrip" && !distanceValid) {
      return;
    }
    if (mode === "atob" && !to) {
      return;
    }
    if (activeJobRef.current) {
      void cancelRouteGeneration(activeJobRef.current);
      activeJobRef.current = null;
    }
    requestKeyRef.current = crypto.randomUUID();
    setJobId(null);
    submitMutation.mutate({ from, to: mode === "atob" ? to : null });
  };

  const setStartAndGenerate = (waypoint: Waypoint) => {
    setStart(waypoint);
    regenerate(waypoint);
  };

  /**
   * Map taps: roundtrip always (re)sets the start; A-to-B sets the
   * start first, then places/moves the destination.
   */
  const handleMapTap = (waypoint: Waypoint) => {
    if (mode === "roundtrip" || !start) {
      setStartAndGenerate(waypoint);
      return;
    }
    setEnd(waypoint);
    regenerate(start, waypoint);
  };

  const switchMode = (next: "roundtrip" | "atob") => {
    if (next === mode) {
      return;
    }
    setMode(next);
    setEnd(null);
    setJobId(null);
    activeJobRef.current = null;
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

  const toggleAvoid = (value: string) => {
    setAvoid((current) =>
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
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

  const weather = selected?.weather ?? null;

  // One badge per forecast sample, skipping the start (it sits under the
  // start marker) — its values are in the summary panel anyway.
  const weatherMarkers: WeatherMarkerData[] = useMemo(
    () =>
      (selected?.weather?.points ?? []).slice(1).map((point, index) => ({
        id: `wx-${index}`,
        lng: point.lng,
        lat: point.lat,
        icon: weatherEmoji(point.weatherCode),
        label: `${Math.round(point.temperatureC)}° · ${Math.round(point.windSpeedKmh)} km/h`,
        windDeg: point.windDirectionDeg,
      })),
    [selected],
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
        waypoints={start ? (end ? [start, end] : [start]) : []}
        routeCoordinates={selected?.route.coordinates}
        alternatives={alternatives}
        onSelectAlternative={(id) => setSelectedIndex(Number(id))}
        dots={highlightDots}
        fitTo={selected?.route.coordinates ?? null}
        centerOn={!selected && start ? [start.lng, start.lat] : null}
        weatherMarkers={weatherMarkers}
        interactive
        onAddWaypoint={handleMapTap}
      />

      {/* Ride-time weather for the selected route. */}
      {weather && selected && (
        <div className="absolute top-4 right-14 z-10 flex flex-col gap-1 rounded-xl border bg-background/95 p-3 text-xs shadow-lg backdrop-blur">
          <span className="flex items-center gap-2 font-medium text-sm">
            {weatherEmoji(weather.points[0]?.weatherCode ?? 3)}
            {Math.round(weather.summary.temperatureMinC)}–
            {Math.round(weather.summary.temperatureMaxC)} °C
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <span
              className="inline-block"
              style={{
                transform: `rotate(${(weather.summary.dominantWindDirectionDeg + 180) % 360}deg)`,
              }}
            >
              ↑
            </span>
            {Math.round(weather.summary.windAvgKmh)} km/h from{" "}
            {compassLabel(weather.summary.dominantWindDirectionDeg)}
            {" · "}
            {Math.round(weather.summary.headwindShare * 100)}% headwind
          </span>
          {weather.summary.precipitationProbabilityMax >= 20 && (
            <span className="text-muted-foreground">
              💧 {Math.round(weather.summary.precipitationProbabilityMax)}% rain
              risk
            </span>
          )}
          {Math.abs(
            weather.windAdjustedDurationMin - selected.route.duration / 60,
          ) >= 3 && (
            <span className="text-muted-foreground">
              ≈ {formatDuration(weather.windAdjustedDurationMin * 60)} with wind
            </span>
          )}
          {selected.airQuality && (
            <span className="text-muted-foreground">
              🍃 air {aqiLabel(selected.airQuality.europeanAqi)} (AQI{" "}
              {selected.airQuality.europeanAqi})
            </span>
          )}
        </div>
      )}

      {/* Floating control panel, Komoot-style on the left. */}
      <div className="absolute top-4 left-4 z-10 flex max-h-[calc(100%-2rem)] w-[min(22rem,calc(100%-2rem))] flex-col gap-3 overflow-y-auto">
        <div className="flex flex-col gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
          <div className="flex items-center gap-2 text-sm font-medium">
            <SparklesIcon className="size-4 text-primary" />
            Route generator
          </div>

          <div className="flex rounded-lg border p-0.5">
            {(
              [
                { value: "roundtrip", label: "Roundtrip" },
                { value: "atob", label: "A to B" },
              ] as const
            ).map((item) => (
              <button
                key={item.value}
                type="button"
                className={cn(
                  "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  mode === item.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => switchMode(item.value)}
              >
                {item.label}
              </button>
            ))}
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

          {/* `flex-wrap` + `min-w-0`: the six category chips are wider than a
              phone-sized panel. Without these the strip refused to shrink and
              shoved the distance field roughly 80px off screen — where it was
              unreachable, because the panel clips instead of scrolling. */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-1 basis-full rounded-lg border p-0.5 sm:basis-auto">
              {CATEGORIES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={cn(
                    "min-w-0 flex-1 truncate rounded-md px-2 py-1 text-xs font-medium transition-colors",
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
            {mode === "roundtrip" ? (
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
            ) : (
              <Select value={detourFactor} onValueChange={setDetourFactor}>
                <SelectTrigger className="h-8 w-28" aria-label="Allowed detour">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="end">
                  <SelectItem value="1.1">Direct</SelectItem>
                  <SelectItem value="1.3">+30% detour</SelectItem>
                  <SelectItem value="1.6">+60% detour</SelectItem>
                </SelectContent>
              </Select>
            )}
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
                disabled={
                  generating ||
                  !elevationValid ||
                  (mode === "roundtrip" ? !distanceValid : !end)
                }
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

          <button
            type="button"
            className="flex items-center gap-1 self-start text-muted-foreground text-xs hover:text-foreground"
            onClick={() => setMoreOpen((open) => !open)}
          >
            {moreOpen ? (
              <ChevronUpIcon className="size-3.5" />
            ) : (
              <ChevronDownIcon className="size-3.5" />
            )}
            More options
          </button>

          {moreOpen && (
            <div className="flex flex-col gap-3 border-t pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="genmap-elevation"
                    className="text-muted-foreground text-xs"
                  >
                    Climbing target (m)
                  </Label>
                  <Input
                    id="genmap-elevation"
                    className="h-8"
                    inputMode="numeric"
                    placeholder="e.g. 600"
                    value={elevationTarget}
                    onChange={(event) => setElevationTarget(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="genmap-difficulty"
                    className="text-muted-foreground text-xs"
                  >
                    Difficulty
                  </Label>
                  <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger id="genmap-difficulty" className="h-8">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start">
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="moderate">Moderate</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="genmap-surface"
                    className="text-muted-foreground text-xs"
                  >
                    Surface
                  </Label>
                  <Select value={surface} onValueChange={setSurface}>
                    <SelectTrigger id="genmap-surface" className="h-8">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start">
                      <SelectItem value="paved">Mostly paved</SelectItem>
                      <SelectItem value="unpaved">Mostly unpaved</SelectItem>
                      <SelectItem value="mixed">Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="genmap-traffic"
                    className="text-muted-foreground text-xs"
                  >
                    Traffic
                  </Label>
                  <Select value={maxTraffic} onValueChange={setMaxTraffic}>
                    <SelectTrigger id="genmap-traffic" className="h-8">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start">
                      <SelectItem value="3">Avoid busy roads</SelectItem>
                      <SelectItem value="2">Quiet streets</SelectItem>
                      <SelectItem value="1">Mostly car-free</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-muted-foreground text-xs">Avoid</span>
                <div className="flex flex-wrap gap-1.5">
                  {AVOID_OPTIONS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        avoid.includes(item.value)
                          ? "border-primary bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => toggleAvoid(item.value)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!start && (
            <p className="text-muted-foreground text-xs">
              Tap the map, search a place or use your location to set the start
              — routes appear right away.
            </p>
          )}
          {start && mode === "atob" && !end && (
            <p className="text-muted-foreground text-xs">
              Now tap the map where the route should end.
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
                {(option.matchPercent != null ||
                  (option.labels?.length ?? 0) > 0) && (
                  <span className="flex flex-wrap gap-1">
                    {option.matchPercent != null && (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 font-medium text-[10px] text-primary">
                        {option.matchPercent}% match
                      </span>
                    )}
                    {(option.labels ?? []).map((label) => (
                      <span
                        key={label}
                        className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {LABEL_TEXT[label] ?? label}
                      </span>
                    ))}
                  </span>
                )}
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
                  {option.detourFactor !== undefined && (
                    <span>
                      +
                      {Math.max(0, Math.round((option.detourFactor - 1) * 100))}
                      % vs. direct
                    </span>
                  )}
                  {option.weather && (
                    <span>
                      {weatherEmoji(option.weather.points[0]?.weatherCode ?? 3)}{" "}
                      {Math.round(option.weather.summary.temperatureMaxC)}°
                    </span>
                  )}
                  {option.physicalEffortKj !== undefined && (
                    <span>⚡ {option.physicalEffortKj} kJ</span>
                  )}
                  {option.estimatedBatteryWh !== undefined && (
                    <span>🔋 {option.estimatedBatteryWh} Wh</span>
                  )}
                  {(option.greenShare ?? 0) >= 0.25 && (
                    <span>
                      🌳 {Math.round((option.greenShare ?? 0) * 100)}%
                    </span>
                  )}
                  {(option.waterShare ?? 0) >= 0.25 && (
                    <span>
                      💧 {Math.round((option.waterShare ?? 0) * 100)}%
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
