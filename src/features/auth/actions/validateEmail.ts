"use server";

import dns from "node:dns/promises";
import { limitByIp } from "@/lib/rateLimit";

export async function validateEmailDomain(email: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  // This action resolves MX records for any domain a caller names, which
  // makes it a free DNS lookup service. Cap it per IP.
  const limit = await limitByIp("email-domain-check", {
    limit: 20,
    windowSec: 60,
  });
  if (!limit.allowed) {
    // Fail open on the *validation* (the signup path still rate limits), but
    // do not perform the lookup.
    return { valid: true };
  }

  try {
    const domain = email.split("@")[1];

    if (!domain) {
      return { valid: false, error: "Invalid email format" };
    }

    // Check MX records for the domain
    const mxRecords = await dns.resolveMx(domain);

    if (!mxRecords || mxRecords.length === 0) {
      return {
        valid: false,
        error: "This email domain doesn't accept emails",
      };
    }

    return { valid: true };
  } catch (error) {
    // DNS errors mean the domain likely doesn't exist or has no MX records
    if (error instanceof Error) {
      if (
        error.message.includes("ENOTFOUND") ||
        error.message.includes("ENODATA")
      ) {
        return {
          valid: false,
          error: "This email domain doesn't exist",
        };
      }
    }

    // For other errors, we'll allow the email (could be network issues)
    console.error("DNS lookup error:", error);
    return { valid: true };
  }
}
