"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPinIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { searchPlaces } from "../actions/searchPlaces";
import { RIDE_DIFFICULTY_OPTIONS, RIDE_PACE_OPTIONS } from "../lib/format";
import type { RideFiltersInput } from "../schemas";
import type {
  PlaceResult,
  RideDifficulty,
  RideListPage,
  RidePace,
} from "../types";
import { RidesGrid } from "./ridesGrid";

/** Radix Select items can't use an empty string, so "all" means no filter. */
const ALL = "all";

const RADIUS_OPTIONS = ["10", "25", "50", "100"] as const;

/**
 * Filter bar for the rides list: debounced text search over title/start
 * location, pace and difficulty selects, a proximity ("near this place")
 * filter with radius, and a switch to include past rides.
 * The filters become part of the query key, so changing them refetches.
 */
export function RideFilters({ initialPage }: { initialPage?: RideListPage }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pace, setPace] = useState<RidePace | null>(null);
  const [difficulty, setDifficulty] = useState<RideDifficulty | null>(null);
  const [includePast, setIncludePast] = useState(false);
  const [nearPlace, setNearPlace] = useState<PlaceResult | null>(null);
  const [radiusKm, setRadiusKm] = useState<string>("25");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filters: RideFiltersInput = {
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(pace ? { pace } : {}),
    ...(difficulty ? { difficulty } : {}),
    ...(includePast ? { includePast: true } : {}),
    ...(nearPlace
      ? {
          nearLat: nearPlace.lat,
          nearLng: nearPlace.lng,
          radiusKm: Number(radiusKm),
        }
      : {}),
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title or start location"
            aria-label="Search rides"
            className="pl-8"
          />
        </div>

        <Select
          value={pace ?? ALL}
          onValueChange={(value) =>
            setPace(value === ALL ? null : (value as RidePace))
          }
        >
          <SelectTrigger className="sm:w-40" aria-label="Filter by pace">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value={ALL}>Any pace</SelectItem>
            {RIDE_PACE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={difficulty ?? ALL}
          onValueChange={(value) =>
            setDifficulty(value === ALL ? null : (value as RideDifficulty))
          }
        >
          <SelectTrigger className="sm:w-44" aria-label="Filter by difficulty">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value={ALL}>Any difficulty</SelectItem>
            {RIDE_DIFFICULTY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <NearPlaceSearch value={nearPlace} onChange={setNearPlace} />

        {nearPlace && (
          <Select value={radiusKm} onValueChange={setRadiusKm}>
            <SelectTrigger className="sm:w-36" aria-label="Radius">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              {RADIUS_OPTIONS.map((km) => (
                <SelectItem key={km} value={km}>
                  {km} km
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Label
          htmlFor="include-past"
          className="flex cursor-pointer select-none items-center gap-2.5 text-sm font-normal"
        >
          <Switch
            id="include-past"
            checked={includePast}
            onCheckedChange={setIncludePast}
          />
          Include past rides
        </Label>
      </div>

      <RidesGrid filters={filters} initialPage={initialPage} />
    </div>
  );
}

/**
 * Debounced place search (MapTiler/Nominatim via the searchPlaces action)
 * used for the proximity filter. Selection is shown as a removable chip.
 */
function NearPlaceSearch({
  value,
  onChange,
}: {
  value: PlaceResult | null;
  onChange: (place: PlaceResult | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: results = [] } = useQuery<PlaceResult[]>({
    queryKey: ["near-place-search", query],
    queryFn: () => searchPlaces(query),
    enabled: query.trim().length >= 2 && open,
  });

  // Close the dropdown on outside click.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  if (value) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm">
        <MapPinIcon className="size-3.5 text-muted-foreground" />
        <span className="max-w-40 truncate">{value.name}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Clear place filter"
          onClick={() => {
            onChange(null);
            setQuery("");
          }}
        >
          <XIcon className="size-3.5" />
        </Button>
      </span>
    );
  }

  return (
    <div ref={containerRef} className="relative sm:w-56">
      <MapPinIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Near a place…"
        aria-label="Filter rides near a place"
        className="pl-8"
      />
      {open && results.length > 0 && (
        <ul
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md"
          // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: option rows are keyboard-focusable buttons
          role="listbox"
          aria-label="Place suggestions"
        >
          {results.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                onClick={() => {
                  onChange(place);
                  setOpen(false);
                }}
              >
                {place.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
