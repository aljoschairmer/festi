"use server";

import { prisma } from "@/lib/prisma";
import { limitByIp } from "@/lib/rateLimit";

export async function checkUsernameAvailable(username: string): Promise<{
  available: boolean;
  error?: string;
}> {
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

    return { available: true };
  }
}
