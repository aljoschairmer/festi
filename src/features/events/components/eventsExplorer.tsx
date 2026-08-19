"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCalendarEvents } from "../actions/getCalendarEvents";
import { syncCalendarEvents } from "../actions/syncCalendarEvents";
import {
  EVENT_TYPE_GROUPS,
  type EventTypeGroupKey,
  eventTypeGroup,
  lvName,
} from "../lib/eventTypes";
import { EventsList } from "./eventsList";
import { EventsMap } from "./eventsMap";

/** Radix Select items can't use an empty string, so "all" means no filter. */
const ALL = "all";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The events calendar: filter bar (type, region, date range), a map of
 * Germany with one dot per event, and a sidebar list with legend. Data comes
 * from the cached rad-net calendar; a background sync (kicked off here and
 * polled while work remains) keeps the cache fresh and fills in coordinates.
 */
export function EventsExplorer() {
  const queryClient = useQueryClient();
  const [group, setGroup] = useState<EventTypeGroupKey | typeof ALL>(ALL);
  const [region, setRegion] = useState<string>(ALL);
  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["radnet-events"],
    queryFn: () => getCalendarEvents(),
  });

  // Sync pump: each call does one bounded unit of scraping server-side and
  // reports how much detail work remains; keep polling until it hits zero.
  // The interval doubles as pacing towards rad-net's rate limiting, so keep
  // it generous — coordinates trickle onto the map while the page is open.
  const { data: sync } = useQuery({
    queryKey: ["radnet-sync"],
    queryFn: () => syncCalendarEvents(),
    refetchInterval: (query) => {
      const result = query.state.data;
      if (!result) {
        return false;
      }
      if (result.locked) {
        return 10_000;
      }
      return result.pendingDetails > 0 ? 30_000 : false;
    },
    refetchOnWindowFocus: false,
  });

  // Each completed sync step may have added events or coordinates.
  useEffect(() => {
    if (sync) {
      queryClient.invalidateQueries({ queryKey: ["radnet-events"] });
    }
  }, [sync, queryClient]);

  const regionOptions = useMemo(
    () =>
      Array.from(
        new Set(events.map((event) => event.lvAbbr).filter(Boolean)),
      ).sort() as string[],
    [events],
  );

  const filtered = useMemo(
    () =>
      events.filter((event) => {
        if (group !== ALL && eventTypeGroup(event.type) !== group) {
          return false;
        }
        if (region !== ALL && event.lvAbbr !== region) {
          return false;
        }
        // ISO dates compare correctly as strings.
        if (fromDate && event.date < fromDate) {
          return false;
        }
        if (toDate && event.date > toDate) {
          return false;
        }
        if (debouncedSearch) {
          const query = debouncedSearch.toLowerCase();
          const haystack = `${event.title} ${event.club ?? ""}`.toLowerCase();
          if (!haystack.includes(query)) {
            return false;
          }
        }
        return true;
      }),
    [events, group, region, fromDate, toDate, debouncedSearch],
  );

  const syncing = Boolean(sync && (sync.locked || sync.pendingDetails > 0));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Select
          value={group}
          onValueChange={(value) =>
            setGroup(value as EventTypeGroupKey | typeof ALL)
          }
        >
          <SelectTrigger className="sm:w-44" aria-label="Filter by event type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value={ALL}>All types</SelectItem>
            {EVENT_TYPE_GROUPS.map((entry) => (
              <SelectItem key={entry.key} value={entry.key}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger className="sm:w-52" aria-label="Filter by region">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value={ALL}>All regions</SelectItem>
            {regionOptions.map((abbr) => (
              <SelectItem key={abbr} value={abbr}>
                {lvName(abbr)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={fromDate}
          onChange={(event) => setFromDate(event.target.value)}
          aria-label="From date"
          className="sm:w-40"
        />
        <Input
          type="date"
          value={toDate}
          min={fromDate || undefined}
          onChange={(event) => setToDate(event.target.value)}
          aria-label="To date"
          className="sm:w-40"
        />

        <div className="relative sm:ml-auto sm:w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title or club"
            aria-label="Search events"
            className="pl-8"
          />
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {syncing && (
            <span className="flex items-center gap-1.5">
              <Loader2Icon className="size-3.5 animate-spin" />
              Syncing calendar…
            </span>
          )}
          <span>
            <span className="font-semibold text-foreground">
              {filtered.length}
            </span>{" "}
            events
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:h-[640px] lg:flex-row">
        <div className="h-[420px] overflow-hidden rounded-lg border lg:h-full lg:flex-1">
          <EventsMap events={filtered} selectedId={selectedId} />
        </div>

        <aside className="flex max-h-[420px] flex-col rounded-lg border lg:max-h-full lg:w-88">
          <div className="border-b px-3 py-2 text-xs text-muted-foreground">
            {isLoading
              ? "Loading events…"
              : `${filtered.length} events · click one to locate it`}
          </div>

          <EventsList
            events={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />

          <div className="flex flex-wrap gap-x-3 gap-y-1 border-t px-3 py-2">
            {EVENT_TYPE_GROUPS.map((entry) => (
              <span
                key={entry.key}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden
                />
                {entry.label}
              </span>
            ))}
          </div>

          <div className="border-t px-3 py-1.5 text-center text-[11px] text-muted-foreground">
            Data:{" "}
            <a
              href="https://breitensport.rad-net.de/breitensportkalender/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:text-primary hover:underline"
            >
              rad-net.de Breitensportkalender
            </a>{" "}
            (BDR)
          </div>
        </aside>
      </div>
    </div>
  );
}
