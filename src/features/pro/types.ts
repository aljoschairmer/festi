import type { ElevationPoint, Waypoint } from "@/features/rides/types";

export type ProRaceStatus = "upcoming" | "live" | "finished" | "unknown";

export type ProRaceSummary = {
  key: string;
  name: string;
  year: number;
  status: ProRaceStatus;
  /** ISO date (yyyy-mm-dd) of the first stage, when known. */
  startDate: string | null;
  /** ISO date of the last stage, when known. */
  endDate: string | null;
  stageCount: number | null;
  /** Team logo URLs of participating teams, for the hub card. Empty when unknown. */
  teamLogos: string[];
};

/** One stage in a race's program. */
export type ProStage = {
  /** Stage number; 0 denotes a prologue. */
  number: number;
  /** ISO date (yyyy-mm-dd), when known. */
  date: string | null;
  /** ASO stage type code (PLN, VAL, MMG, HMG, ...), when known. */
  type: string | null;
  departure: string | null;
  arrival: string | null;
  distanceKm: number | null;
};

export type ProStartlistRider = {
  bib: number | null;
  firstName: string;
  lastName: string;
  nationality: string | null;
  /** Head-shot photo URL from ASO, when available. */
  photoUrl: string | null;
  /** Stage the rider abandoned during; null while still in the race. */
  withdrawnStage: number | null;
};

export type ProStartlistTeam = {
  name: string;
  code: string | null;
  riders: ProStartlistRider[];
  /** Team logo URL from ASO, when available. */
  logoUrl: string | null;
  /** Team jersey/kit image URL from ASO, when available. */
  jerseyUrl: string | null;
  /** Team accent color (hex), when available. */
  color: string | null;
};

export type ProStandingRow = {
  rank: number | null;
  rider: string;
  team: string | null;
  nation: string | null;
  /** Result value (total time for the GC leader). */
  time: string | null;
  /** Gap to the leader, e.g. "+0:42". */
  gap: string | null;
  /** Team logo URL, matched from the ASO startlist. Null when unmatched. */
  teamLogoUrl: string | null;
  /** Rider head-shot URL, matched from the ASO startlist. Null when unmatched. */
  riderPhotoUrl: string | null;
};

/** Everything the race detail page renders. */
export type ProRaceDetail = {
  key: string;
  name: string;
  year: number;
  stages: ProStage[];
  startlist: ProStartlistTeam[];
  /** Empty when no results are published yet. */
  standings: ProStandingRow[];
  /** False when the race has no timing partner at all (e.g. Paris-Roubaix). */
  hasStandingsSource: boolean;
};

/** Serializable stage route payload for the map + elevation chart. */
export type ProStageRoute = {
  /** Encoded polyline of the (downsampled) route geometry. */
  routeGeometry: string;
  /** Start and finish markers. */
  waypoints: Waypoint[];
  elevationProfile: ElevationPoint[];
  distanceMeters: number;
  elevationGain: number;
  elevationLoss: number;
  minEle: number | null;
  maxEle: number | null;
  /** URL of the GPX file the route was parsed from, when known. */
  sourceUrl: string | null;
};

/** A point of interest along the stage route (KOM climb or sprint). */
export type ProStagePoi = {
  kind: "kom" | "sprint";
  name: string | null;
  /** Km from the stage start. */
  km: number | null;
  lat: number;
  lng: number;
  /** KOM category ("H", "1".."4"); null for sprints. */
  category: string | null;
  /** Climb length in meters (KOM only). */
  climbLengthMeters: number | null;
  /** Climb gradient in % (KOM only). */
  gradientPct: number | null;
};

/** Everything the stage detail page renders. */
export type ProStageDetail = {
  raceKey: string;
  raceName: string;
  year: number;
  stage: ProStage;
  /** Null when no GPX route is published for this stage. */
  route: ProStageRoute | null;
  /** KOM climbs and sprints along the route; empty when none are published. */
  pois: ProStagePoi[];
  /** Race-center commentary for this stage, newest-first. */
  news: ProNewsArticle[];
};

/** Jersey colors, in ASO's YGPW order. */
export type ProJersey = "yellow" | "green" | "polka" | "white";

/** One rider position from the live GPS telemetry feed. */
export type ProLiveRider = {
  bib: number;
  lat: number;
  lng: number;
  /** "Firstname Lastname", when the bib matched the startlist. */
  name: string | null;
  team: string | null;
  /** Jersey worn by this rider, when they lead a classification. */
  jersey: ProJersey | null;
  /** Team accent color (hex) for the map dot, when known. */
  teamColor: string | null;
  /**
   * Rider head-shot for the map popup. Optional because telemetry frames
   * captured before the field existed are replayed from the database as-is.
   */
  photoUrl?: string | null;
  /** Instantaneous speed (km/h). */
  kph: number | null;
  kmToFinish: number | null;
  /** Gap to the first rider on the road (seconds). */
  secToFirstRider: number | null;
};

/** Summary numbers for the live info strip, from the head of the race. */
export type ProLiveInfo = {
  /** Distance left for the leading rider (km). */
  kmToFinish: number | null;
  /** Speed of the head of the race (km/h). */
  speedKph: number | null;
  /** Average speed of the head of the race (km/h). */
  avgSpeedKph: number | null;
  /** Temperature at the front of the race (°C). */
  temperatureC: number | null;
  /** Road gradient at the front of the race (%). */
  gradientPct: number | null;
};

/** Live weather from the checkpoint nearest to the head of the race. */
export type ProLiveWeather = {
  temperatureC: number | null;
  windKph: number | null;
  windDirection: string | null;
  description: string | null;
  /** Name of the checkpoint this weather was measured at. */
  place: string | null;
};

/** The rider currently leading one of the four ASO classifications. */
export type ProJerseyHolder = {
  jersey: ProJersey;
  rider: string;
};

/** Payload the live stage panel polls for. */
export type ProLiveStageData = {
  /** False when the upstream reports no live racing (telemetry is 204/null). */
  live: boolean;
  /** Epoch ms of the telemetry frame, when the upstream provides it. */
  updatedAt: number | null;
  riders: ProLiveRider[];
  info: ProLiveInfo | null;
  /** Weather near the head of the race, from the closest checkpoint. */
  weather: ProLiveWeather | null;
  /** Current YGPW jersey leaders, in yellow/green/polka/white order. */
  jerseyHolders: ProJerseyHolder[];
  /** Current live classification, empty when none is published. */
  ranking: ProStandingRow[];
  rankingSource: "tissot" | "aso" | null;
  /** Live race-center commentary feed, newest-first. */
  news: ProNewsArticle[];
};

/** One stage line on the race overview map. */
export type ProRaceMapStage = {
  /** Stage number when known (0 = prologue); null e.g. for a full-route line. */
  number: number | null;
  name: string;
  /** Encoded polyline of the downsampled stage geometry. */
  geometry: string;
  distanceKm: number | null;
};

/** Overview map payload for the race detail page: all stages at once. */
export type ProRaceMap = {
  /** Where the geometry came from: the official Tissot KMZ or per-stage GPX. */
  source: "tissot" | "gpx";
  stages: ProRaceMapStage[];
  totalDistanceKm: number | null;
};

/** An official Tissot report PDF for one stage. */
export type ProStageReport = {
  id: string;
  name: string;
  stage: number;
};

/** One race-center news/commentary item from ASO. */
export type ProNewsArticle = {
  id: string;
  title: string;
  /** Body paragraphs, HTML stripped. */
  paragraphs: string[];
  stage: number;
  /** ISO timestamp (race-local, with offset), when published. */
  publishedAt: string | null;
  pinned: boolean;
};

/** One persisted telemetry snapshot, replayed on past stage pages. */
export type ProReplayFrame = {
  /** Epoch ms the frame was captured at. */
  capturedAt: number;
  riders: ProLiveRider[];
};

/** Replay payload for a past stage; frames are in chronological order. */
export type ProStageReplay = {
  frames: ProReplayFrame[];
};
