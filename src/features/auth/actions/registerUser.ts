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
  // better-auth's limiter guards its router, not `auth.api.signUpEmail`,
  // which this action calls directly — so registration had no limit at all
  // and could be used to send mail through Resend in bulk.
  const limit = await limitByIp("register", { limit: 5, windowSec: 60 * 15 });
  if (!limit.allowed) {
    return {
      success: false as const,
      error: `Too many registration attempts. Try again in ${Math.ceil(limit.retryAfterSec / 60)} minutes.`,
    };
  }

  // Never trust client input on a public endpoint.
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: "Invalid registration data.",
    };
  }

  const { firstName, lastName, username, email, password } = parsed.data;

  // A second, narrower bucket, keyed by address as well as caller. The
  // per-IP limit above caps how many accounts one source can create; this
  // one caps how often a *single* address can be mailed, which is the part
  // that turns a signup form into a way to bomb someone else's inbox.
  // Neither replaces the other: on its own, a per-address key is trivially
  // evaded by varying the address.
  //
  // After parsing, because it needs the address; before the MX lookup and
  // the sign-up orchestration, which are the expensive steps.
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

  // A duplicate email is intentionally NOT checked here: better-auth returns a
  // generic success for existing emails (enumeration protection) and notifies
  // the real account owner via onExistingUserSignUp. See src/lib/auth.ts.

  // Username is a custom field, so better-auth can't produce a friendly
  // "username taken" message from the DB unique violation — check it here.
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
