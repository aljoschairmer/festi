"use server";

import { getCurrentUser } from "@/features/auth/guards";
import { cancelGenerationJob } from "../lib/routeEngine";

type CancelResponse = { success: true } | { success: false; error: string };

/**
 * Cancels a running route generation (user closed the dialog or changed
 * parameters). Best-effort — the engine finalizes waiting jobs
 * immediately and stops running ones at their next checkpoint.
 */
export async function cancelRouteGeneration(
  jobId: string,
): Promise<CancelResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "You must be signed in." };
  }
  if (typeof jobId !== "string" || jobId.length === 0 || jobId.length > 100) {
    return { success: false, error: "Invalid job id." };
  }
  await cancelGenerationJob(jobId);
  return { success: true };
}
