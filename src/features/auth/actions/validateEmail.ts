"use server";

import dns from "node:dns/promises";
import { limitByIp } from "@/lib/rateLimit";

export async function validateEmailDomain(email: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  const limit = await limitByIp("email-domain-check", {
    limit: 20,
    windowSec: 60,
  });
  if (!limit.allowed) {
    return { valid: true };
  }

  try {
    const domain = email.split("@")[1];

    if (!domain) {
      return { valid: false, error: "Invalid email format" };
    }

    const mxRecords = await dns.resolveMx(domain);

    if (!mxRecords || mxRecords.length === 0) {
      return {
        valid: false,
        error: "This email domain doesn't accept emails",
      };
    }

    return { valid: true };
  } catch (error) {
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

    console.error("DNS lookup error:", error);
    return { valid: true };
  }
}
