import { z } from "zod";

export const waypointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const routeProfileSchema = z
  .enum(["trekking", "fastbike", "gravel"])
  .default("trekking");

export const ridePaceSchema = z.enum(["relaxed", "social", "tempo", "fast"]);

export const rideDifficultySchema = z.enum([
  "easy",
  "moderate",
  "hard",
  "expert",
]);

/** Validates a ride id passed to a server action. */
export const rideIdSchema = z.string().min(1, "Ride id is required.");

/** Null means unlimited spots. */
export const maxParticipantsSchema = z
  .number()
  .int("Spots must be a whole number.")
  .min(2, "A ride needs room for at least 2 riders.")
  .max(200, "A ride can have at most 200 spots.")
  .nullish();

export const calculateRouteSchema = z.object({
  waypoints: z
    .array(waypointSchema)
    .min(2, "Add at least two points to build a route.")
    .max(25, "A route can have at most 25 points."),
  profile: routeProfileSchema,
});

export type CalculateRouteInput = z.infer<typeof calculateRouteSchema>;

/** Bike category understood by the route generation engine. */
export const generationCategorySchema = z.enum([
  "road",
  "touring",
  "gravel",
  "mtb",
  "enduro",
  "cargo",
]);

/**
 * Input for the on-the-fly route generator. Roundtrip when `end` is
 * omitted; the engine enforces coverage, quota and detailed validation —
 * this schema only keeps obviously broken input away from it.
 */
export const generateRouteSchema = z
  .object({
    start: waypointSchema,
    end: waypointSchema.optional(),
    category: generationCategorySchema,
    targetDistanceKm: z.number().min(1).max(400).optional(),
    minDistanceKm: z.number().min(1).max(400).optional(),
    maxDistanceKm: z.number().min(1).max(400).optional(),
    targetElevationGainM: z.number().min(0).max(10000).optional(),
    /** Point-to-point only: how much longer than the direct line (1–3). */
    maxDetourFactor: z.number().min(1).max(3).optional(),
    /** Traffic-stress ceiling (LTS 1–5): avoid road classes above it. */
    maxTrafficStress: z.number().int().min(1).max(5).optional(),
    difficulty: z.enum(["easy", "moderate", "hard"]).optional(),
    surfacePreference: z.enum(["paved", "unpaved", "mixed"]).optional(),
    avoid: z.array(z.string().max(30)).max(10).optional(),
    preferScenic: z.boolean().optional(),
    eBike: z.boolean().optional(),
    numAlternatives: z.number().int().min(1).max(5).optional(),
    /** Planned ride start (ISO 8601); weather/air samples use it. */
    departureTime: z.string().datetime().optional(),
    /** Client-generated key making submit retries safe. */
    requestKey: z.string().min(8).max(100).optional(),
  })
  .refine(
    (input) =>
      input.end !== undefined ||
      input.targetDistanceKm !== undefined ||
      (input.minDistanceKm !== undefined && input.maxDistanceKm !== undefined),
    { message: "Choose a target distance for a roundtrip." },
  );

export type GenerateRouteInput = z.infer<typeof generateRouteSchema>;

/** Maximum number of weekly instances a recurring ride series can have. */
export const MAX_RECURRENCE_WEEKS = 12;

/** 1 = single ride; 2–12 = weekly recurring series. */
export const repeatWeeklySchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_RECURRENCE_WEEKS)
  .default(1);

/**
 * Reference to a finished generation job. When present, `createRide`
 * fetches the route from the engine server-side instead of recomputing
 * it from waypoints — generated roundtrips have no reproducible
 * waypoint chain.
 */
export const rideGenerationRefSchema = z.object({
  jobId: z.string().min(1).max(100),
  routeIndex: z.number().int().min(0).max(4),
});

export const createRideSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(100, "Title must be at most 100 characters"),
  description: z
    .string()
    .trim()
    .max(1000, "Description must be at most 1000 characters")
    .optional()
    .or(z.literal("")),
  startTime: z.coerce.date().refine((date) => date.getTime() > Date.now(), {
    message: "Start time must be in the future.",
  }),
  startLocation: z
    .string()
    .trim()
    .max(200, "Start location is too long.")
    .optional()
    .or(z.literal("")),
  waypoints: z
    .array(waypointSchema)
    .min(1, "Add a start point.")
    .max(25, "A route can have at most 25 points."),
  profile: routeProfileSchema,
  pace: ridePaceSchema.nullish(),
  difficulty: rideDifficultySchema.nullish(),
  maxParticipants: maxParticipantsSchema,
  /** Optional group this ride belongs to. Membership is verified on the server. */
  groupId: z.string().nullish(),
  /** Number of weekly instances to create (1 = single ride). */
  repeatWeekly: repeatWeeklySchema,
  /** Set when the route came from the generator instead of manual planning. */
  generation: rideGenerationRefSchema.nullish(),
});

export type CreateRideInput = z.infer<typeof createRideSchema>;

/** Manually planned rides still need at least two points for BRouter. */
export const createRideRefinedSchema = createRideSchema.refine(
  (data) => data.generation != null || data.waypoints.length >= 2,
  {
    message: "Add at least two points to build a route.",
    path: ["waypoints"],
  },
);

/** Raw max-spots input used by the client forms: empty string = unlimited. */
const maxParticipantsFormField = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === "" ||
      (/^\d+$/.test(value) && Number(value) >= 2 && Number(value) <= 200),
    {
      message: "Enter a number between 2 and 200, or leave empty for no limit.",
    },
  );

/** Client-side form schema. Route data is computed on the server. */
export const rideFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(100, "Title must be at most 100 characters"),
  description: z
    .string()
    .trim()
    .max(1000, "Description must be at most 1000 characters")
    .optional()
    .or(z.literal("")),
  startTime: z.string().min(1, "Start time is required"),
  pace: ridePaceSchema.optional(),
  difficulty: rideDifficultySchema.optional(),
  maxParticipants: maxParticipantsFormField,
  groupId: z.string().nullish(),
  /** Weekly repeat count as a select value ("1" = single ride). */
  repeatWeekly: z.enum(["1", "2", "4", "8", "12"]),
});

export type RideFormValues = z.infer<typeof rideFormSchema>;

/** Maximum number of after-ride photos an owner can attach. */
export const MAX_RIDE_PHOTOS = 3;

/**
 * Editable ride fields (no route/waypoints — those are fixed after creation).
 * `null` for pace/difficulty/maxParticipants clears the value.
 */
export const updateRideSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(150, "Title must be at most 150 characters"),
  description: z
    .string()
    .trim()
    .max(5000, "Description must be at most 5000 characters")
    .optional()
    .or(z.literal("")),
  startTime: z.coerce.date().refine((date) => date.getTime() > Date.now(), {
    message: "Start time must be in the future.",
  }),
  pace: ridePaceSchema.nullish(),
  difficulty: rideDifficultySchema.nullish(),
  maxParticipants: maxParticipantsSchema,
});

export type UpdateRideInput = z.infer<typeof updateRideSchema>;

/** Client-side edit form schema. */
export const updateRideFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(150, "Title must be at most 150 characters"),
  description: z
    .string()
    .trim()
    .max(5000, "Description must be at most 5000 characters")
    .optional()
    .or(z.literal("")),
  startTime: z.string().min(1, "Start time is required"),
  pace: ridePaceSchema.optional(),
  difficulty: rideDifficultySchema.optional(),
  maxParticipants: maxParticipantsFormField,
});

export type UpdateRideFormValues = z.infer<typeof updateRideFormSchema>;

/** Discovery filters for the rides list. All fields optional. */
export const rideFiltersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  pace: ridePaceSchema.optional(),
  difficulty: rideDifficultySchema.optional(),
  includePast: z.boolean().optional(),
  /** Proximity filter: rides starting within `radiusKm` of (nearLat, nearLng). */
  nearLat: z.number().min(-90).max(90).optional(),
  nearLng: z.number().min(-180).max(180).optional(),
  radiusKm: z.number().min(1).max(500).optional(),
});

export type RideFiltersInput = z.infer<typeof rideFiltersSchema>;
