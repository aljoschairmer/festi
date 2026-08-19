"use server";

import { getCurrentUser } from "@/features/auth/guards";
import {
  getGenerationJobResult,
  getGenerationJobStatus,
  toRouteResult,
} from "../lib/routeEngine";
import type { RouteGenerationStatus } from "../types";

type StatusResponse =
  | { success: true; status: RouteGenerationStatus }
  | { success: false; error: string };

/**
 * Polls a generation job. Once the job has SUCCEEDED the normalized
 * route options ride along, so the client needs a single action for the
 * whole polling loop.
 */
export async function getRouteGenerationStatus(
  jobId: string,
): Promise<StatusResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "You must be signed in." };
  }
  if (typeof jobId !== "string" || jobId.length === 0 || jobId.length > 100) {
    return { success: false, error: "Invalid job id." };
  }

  try {
    const status = await getGenerationJobStatus(jobId);
    if (!status) {
      return {
        success: false,
        error: "This generation has expired. Please generate again.",
      };
    }

    if (status.state !== "SUCCEEDED") {
      return {
        success: true,
        status: {
          state: status.state,
          progressPercent: status.progressPercent,
          message: status.message,
          errorDetail: status.errorDetail,
        },
      };
    }

    const result = await getGenerationJobResult(jobId);
    if (result.status === "expired") {
      return {
        success: false,
        error: "The generated routes have expired. Please generate again.",
      };
    }
    if (result.status === "running") {
      return {
        success: true,
        status: {
          state: "RUNNING",
          progressPercent: status.progressPercent,
          message: status.message,
        },
      };
    }
    const routes = result.routes;
    return {
      success: true,
      status: {
        state: "SUCCEEDED",
        progressPercent: 100,
        message: status.message,
        options: routes.map((route) => ({
          route: toRouteResult(route),
          mode: route.mode,
          detourFactor: route.detourFactor,
          difficultyScore: route.difficultyScore,
          unpavedRatio: route.unpavedRatio,
          pushingSectionsM: route.pushingSectionsM,
          highlights: route.highlights,
          weather: route.weather,
          airQuality: route.airQuality,
          avgTrafficStress: route.avgTrafficStress,
          physicalEffortKj: route.physicalEffortKj,
          estimatedBatteryWh: route.estimatedBatteryWh,
          greenShare: route.greenShare,
          waterShare: route.waterShare,
          matchPercent: route.matchPercent,
          labels: route.labels,
          warnings: route.warnings,
        })),
      },
    };
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
