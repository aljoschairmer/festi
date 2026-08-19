"use server";

import { prisma } from "@/lib/prisma";
import { limitByIp } from "@/lib/rateLimit";

export async function checkUsernameAvailable(username: string): Promise<{
  available: boolean;
  error?: string;
}> {
  // Unauthenticated and enumerable: without a cap this action walks the
  // whole username space. Generous enough for a signup form's typing checks;
  // `registerUser` has its own stricter limit on top.
  //
  // A limited call reports the limit rather than answering "available": the
  // check did not run, and the only consumer surfaces this `error` verbatim,
  // so a cheerful "available" here would only fail at submit instead.
  const limit = await limitByIp("username-check", { limit: 30, windowSec: 60 });
  if (!limit.allowed) {
    return {
      available: false,
      error: "Too many attempts. Please try again in a minute.",
    };
  }

  try {
    const existingUser = await prisma.user.findFirst({
      where: { username },
      select: { id: true },
    });

    if (existingUser) {
      return {
        available: false,
        error: "This username is already taken",
      };
    }

    return { available: true };
  } catch (error) {
    console.error("Username check error:", error);
    // Allow signup to continue, the database constraint will catch duplicates
    return { available: true };
  }
}
