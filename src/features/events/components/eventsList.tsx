"use client";

import { ExternalLinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { eventColor, eventLocation, formatEventDate } from "../lib/eventTypes";
import type { CalendarEvent } from "../types";

type EventsListProps = {
  events: CalendarEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

/**
 * Scrollable sidebar list of the filtered events. Clicking a row flies the
 * map to the event (when its coordinates are synced); the external-link icon
 * opens the rad-net detail page.
 */
export function EventsList({ events, selectedId, onSelect }: EventsListProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        No events match the current filters
      </div>
    );
  }

  return (
    <ul className="flex-1 divide-y divide-border overflow-y-auto">
      {events.map((event) => {
        const location = eventLocation(event);
        return (
          <li key={event.id}>
            <div
              className={cn(
                "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-red-500/5",
                selectedId === event.id && "bg-red-500/10",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(event.id)}
                className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
              >
                <span
                  className="mt-1.5 size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: eventColor(event) }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-sm font-medium",
                      event.cancelled &&
                        "line-through opacity-60 decoration-muted-foreground",
                    )}
                  >
                    {event.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {formatEventDate(event.date)}
                  </span>
                  {location && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {location}
                    </span>
                  )}
                  <span className="block text-xs text-muted-foreground">
                    {[
                      event.type || null,
                      event.distances.length
                        ? `${event.distances.join(" / ")} km`
                        : null,
                      event.cancelled ? "Cancelled" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </button>
              <a
                href={event.detailUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${event.title} on rad-net.de`}
                className="mt-0.5 shrink-0 text-muted-foreground/50 transition-colors hover:text-red-500"
              >
                <ExternalLinkIcon className="size-3.5" />
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
