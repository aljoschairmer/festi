"use server";

import { headers } from "next/headers";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { auth } from "@/lib/auth";
import { limitByIp } from "@/lib/rateLimit";
import { type RegisterFormData, registerSchema } from "../schemas";
import { checkUsernameAvailable } from "./checkAvailability";
import { validateEmailDomain } from "./validateEmail";

/**
 * Single entry point for registration. Runs every check server-side in one
 * round trip and returns a friendly error as data (thrown errors are redacted
 * by Next.js in production).
 */
export async function registerUser(input: RegisterFormData) {
  const limit = await limitByIp("register", { limit: 5, windowSec: 60 * 15 });
  if (!limit.allowed) {
    return {
      success: false as const,
      error: `Too many registration attempts. Try again in ${Math.ceil(limit.retryAfterSec / 60)} minutes.`,
    };
  }

  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: "Invalid registration data.",
    };
  }

  const { firstName, lastName, username, email, password } = parsed.data;

  const addressLimit = await limitByIp(
    `register-address:${email.toLowerCase()}`,
    {
      limit: 5,
      windowSec: 60 * 60,
    },
  );
  if (!addressLimit.allowed) {
    return {
      success: false as const,
      error: "Too many registration attempts. Please try again later.",
    };
  }

  const emailValidation = await validateEmailDomain(email);
  if (!emailValidation.valid) {
    return {
      success: false as const,
      error: emailValidation.error ?? "Invalid email domain.",
    };
  }

  const usernameAvailable = await checkUsernameAvailable(username);
  if (!usernameAvailable.available) {
    return {
      success: false as const,
      error: usernameAvailable.error ?? "Username already taken.",
    };
  }

  try {
    const user = await auth.api.signUpEmail({
      headers: await headers(),
      body: {
        email,
        password,
        name: `${firstName} ${lastName}`,
        username,
      },
    });

    await Logger.log(
      ActivityAction.USER_REGISTERED,
      `${email} user just registered!`,
      {
        actorId: user.user.id,
        targetType: "Register",
        metadata: { username: user.user.username, email: user.user.email },
      },
    );
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Registration failed.",
    };
  }

  return { success: true as const, email };
}
