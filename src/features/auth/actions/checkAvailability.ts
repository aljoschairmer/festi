"use server";

import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function checkUsernameAvailable(username: string): Promise<{
  available: boolean;
  error?: string;
}> {
  // This action is callable without authentication and answers a
  // username-existence question, so it must not be scriptable without
  // limits (SEC-05). registerUser has its own stricter limit on top.
  const ip = await getClientIp();
  const rateLimitResult = await checkRateLimit(`username-check:${ip}`, 30, 60);
  if (!rateLimitResult.allowed) {
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
