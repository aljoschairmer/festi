"use server";

import { getCurrentUser } from "@/features/auth/guards";
import {
  type EngineGenerateRequest,
  submitGenerationJob,
} from "../lib/routeEngine";
import { generateRouteSchema } from "../schemas";

type GenerateRouteResponse =
  | { success: true; jobId: string }
  | { success: false; error: string };

/**
 * Kicks off an asynchronous route generation on the route engine and
 * returns the job id for polling via `getRouteGenerationStatus`.
 *
 * The engine handles coverage checks, per-user quotas and detailed
 * validation; its errors are already user-safe and passed through.
 */
export async function generateRoute(
  input: unknown,
): Promise<GenerateRouteResponse> {
  const session = await getCurrentUser();
  if (!session) {
    return { success: false, error: "You must be signed in." };
  }

  const parsed = generateRouteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid generation request.",
    };
  }
  const data = parsed.data;

  const request: EngineGenerateRequest = {
    startLat: data.start.lat,
    startLng: data.start.lng,
    endLat: data.end?.lat,
    endLng: data.end?.lng,
    targetDistanceKm: data.targetDistanceKm,
    minDistanceKm: data.minDistanceKm,
    maxDistanceKm: data.maxDistanceKm,
    targetElevationGainM: data.targetElevationGainM,
    category: data.category,
    difficulty: data.difficulty,
    surfacePreference: data.surfacePreference,
    avoid: data.avoid,
    preferScenic: data.preferScenic,
    eBike: data.eBike,
    numAlternatives: data.numAlternatives ?? 2,
    locale: "en",
  };

  try {
    const { jobId } = await submitGenerationJob(
      request,
      session.user.id,
      data.requestKey,
    );
    return { success: true, jobId };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "The route generator is unavailable. Please try again later.",
    };
  }
}
