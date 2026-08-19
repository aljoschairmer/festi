"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2Icon, MapPinIcon, SearchIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { searchPlaces } from "../actions/searchPlaces";
import type { PlaceResult } from "../types";

type LocationSearchProps = {
  onSelect: (place: PlaceResult) => void;
  onQueryChange?: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  initialQuery?: string;
};

export function LocationSearch({
  onSelect,
  onQueryChange,
  placeholder,
  autoFocus,
  initialQuery,
}: LocationSearchProps) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["places", debounced],
    queryFn: () => searchPlaces(debounced),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const showResults = open && debounced.length >= 2;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <SearchIcon className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            onQueryChange?.(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? "Search for a place or address…"}
          className="pl-9"
        />
        {isFetching && (
          <Loader2Icon className="-translate-y-1/2 absolute top-1/2 right-3 size-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {showResults && (
        <div className="absolute z-20 mt-1 w-full animate-in overflow-hidden rounded-lg border bg-popover shadow-lg fade-in-0 zoom-in-95">
          {results.length === 0 && !isFetching ? (
            <p className="px-3 py-3 text-muted-foreground text-sm">
              No places found.
            </p>
          ) : (
            <ul className="max-h-64 overflow-auto py-1">
              {results.map((place) => (
                <li key={place.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(place);
                      setQuery(place.name);
                      setOpen(false);
                    }}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <MapPinIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="line-clamp-2">{place.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
