export type Waypoint = { lat: number; lng: number };

/** A point rendered on top of the route (e.g. a live rider position). */
export type MapDot = {
  id: string | number;
  lat: number;
  lng: number;
  /** CSS fill color of the dot. */
  color: string;
  /** CSS stroke color; defaults to white. */
  stroke?: string;
  /** Circle radius in px; defaults to 6. Larger dots also draw on top. */
  radius?: number;
  /** Popup title shown on hover/tap (e.g. a rider's name). */
  title?: string;
  subtitle?: string;
  /** Photo shown in the popup next to the title (e.g. a rider head-shot). */
  imageUrl?: string;
};

export type RouteProfile = "trekking" | "fastbike" | "gravel";

export type RideParticipantStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "WAITLISTED";

export type RideStatus = "SCHEDULED" | "CANCELLED";

export type RidePace = "relaxed" | "social" | "tempo" | "fast";

export type RideDifficulty = "easy" | "moderate" | "hard" | "expert";

/** A geocoded place returned by the `searchPlaces` action. */
export type PlaceResult = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

/** Result of a routing request, returned by the `calculateRoute` action. */
export type RouteResult = {
  /** Total distance in meters. */
  distance: number;
  /** Estimated moving time in seconds. */
  duration: number;
  /** Total ascent in meters (Höhenmeter). */
  elevationGain: number;
  /** Total descent in meters. */
  elevationLoss: number;
  /** Encoded polyline of the full route geometry. */
  routeGeometry: string;
  /** Decoded coordinates as `[lng, lat]` pairs for map rendering. */
  coordinates: [number, number][];
  /** Sampled elevation profile along the route. */
  elevationProfile: ElevationPoint[];
};

/** A single sample of the elevation profile: distance (km) vs. elevation (m). */
export type ElevationPoint = {
  distance: number;
  elevation: number;
  /** Position on the route, for highlighting on the map. */
  lat: number;
  lng: number;
};

/**
 * A labeled point of interest pinned onto the elevation profile — a flag row
 * above the chart plus a dot on the profile line (à la official race
 * profiles: categorized climbs, sprints, start and finish).
 */
export type ElevationMarker = {
  kind: "start" | "finish" | "kom" | "sprint";
  /** Km from the start; must fall within the profile's distance domain. */
  km: number;
  /** Profile elevation (m) at `km`, anchoring the dot on the line. */
  elevation: number;
  /** Text next to the flag (place or climb name); null draws the flag alone. */
  label: string | null;
  /** Text inside the flag: KOM category ("H", "1".."4") or "S" for sprints. */
  badge: string | null;
  /** Native tooltip with the full details (name, km, climb length, gradient). */
  title: string | null;
  /** Vertical stagger row (0 = highest) keeping nearby labels apart. */
  level: number;
};

/** A named point along a route (street-name sample from the engine). */
export type RoutePlaceName = {
  name: string;
  lat: number;
  lng: number;
};

/** A scenic POI along a generated route (viewpoint, castle, …). */
export type RouteHighlight = {
  name?: string;
  kind: string;
  lat: number;
  lng: number;
  /** Meters from the start of the route. */
  distanceAlongRouteM: number;
};

/**
 * One candidate produced by the route generation engine, normalized to
 * the app's `RouteResult` shape plus generation-specific extras.
 */
export type GeneratedRouteOption = {
  route: RouteResult;
  mode: "roundtrip" | "point-to-point";
  /** Actual distance ÷ direct distance (point-to-point only). */
  detourFactor?: number;
  /** 0–10 difficulty estimate from the engine. */
  difficultyScore: number;
  /** Share of unpaved surface (0–1). */
  unpavedRatio: number;
  /** Meters where the bike likely has to be pushed. */
  pushingSectionsM: number;
  highlights: RouteHighlight[];
  warnings: string[];
};

/** Live progress of a generation job, as returned by the status action. */
export type RouteGenerationStatus = {
  state: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  progressPercent: number;
  message: string;
  errorDetail?: string;
  /** Present once `state` is SUCCEEDED. */
  options?: GeneratedRouteOption[];
};

export type RideCreator = {
  id: string;
  name: string;
  username: string | null;
  image: string | null;
};

export type RideSummary = {
  id: string;
  title: string;
  description: string | null;
  startLocation: string | null;
  startTime: string;
  distance: number;
  duration: number;
  elevationGain: number;
  elevationLoss: number;
  routeGeometry: string;
  waypoints: Waypoint[];
  status: RideStatus;
  pace: RidePace | null;
  difficulty: RideDifficulty | null;
  /** Null means unlimited spots. */
  maxParticipants: number | null;
  /** Shared id across all instances of a weekly recurring series, if any. */
  recurrenceId: string | null;
  createdAt: string;
  creator: RideCreator;
  /** Number of approved participants (the creator is not counted). */
  participantCount: number;
  isCreator: boolean;
  participantStatus: RideParticipantStatus | null;
  photoCount: number;
};

export type RideParticipantInfo = {
  id: string;
  status: RideParticipantStatus;
  /** null = attendance not marked yet (only meaningful on past rides). */
  attended: boolean | null;
  createdAt: string;
  user: RideCreator;
};

export type RidePhotoInfo = {
  id: string;
  url: string;
  position: number;
};

/** The group a ride was posted to, shown on the ride detail page. */
export type RideGroupInfo = {
  id: string;
  name: string;
};

export type RideDetail = RideSummary & {
  participants: RideParticipantInfo[];
  photos: RidePhotoInfo[];
  elevationProfile: ElevationPoint[];
  /** Null when the ride was not posted to a group. */
  group: RideGroupInfo | null;
  /** Whether the ride has a public (logged-out) page at /rides/[id]. */
  isPublic: boolean;
};
