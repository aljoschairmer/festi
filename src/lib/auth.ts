import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin } from "better-auth/plugins";
import { Logger } from "@/features/logger";
import { ActivityAction } from "@/features/logger/logger";
import { prisma } from "@/lib/prisma";

import {
  getExistingAccountEmailHtml,
  getPasswordResetEmailHtml,
  getVerificationEmailHtml,
  sendEmail,
} from "./email";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  user: {
    additionalFields: {
      username: {
        type: "string",
        required: false,
        unique: true,
      },
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 5,
  },
  baseURL: process.env.NEXT_PUBLIC_APP_URL,

  trustedOrigins: [
    ...(process.env.NODE_ENV === "development"
      ? ["http://localhost:3000"]
      : []),
    ...(process.env.NEXT_PUBLIC_APP_URL
      ? [process.env.NEXT_PUBLIC_APP_URL]
      : []),
  ],
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your password - Festi",
        html: getPasswordResetEmailHtml(url, user.name),
      });
    },

    onPasswordReset: async ({ user }) => {
      await Logger.log(
        ActivityAction.USER_CHANGED_PASSWORD,
        `${user.email} changed their password.`,
        {
          actorId: user.id,
          targetUserId: user.id,
          targetType: "Auth",
        },
      );
    },

    onExistingUserSignUp: async ({ user }) => {
      await sendEmail({
        to: user.email,
        subject: "Someone tried to sign up with your email - Festi",
        html: getExistingAccountEmailHtml(user.name),
      });
    },

    customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
      ...coreFields,
      role: "user",
      banned: false,
      banReason: null,
      banExpires: null,
      ...additionalFields,
      id,
    }),
  },
  emailVerification: {
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your email - Festi",
        html: getVerificationEmailHtml(url, user.name),
      });
    },
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    afterEmailVerification: async (user) => {
      await Logger.log(
        ActivityAction.USER_EMAIL_VERIFIED,
        `${user.email} verified their email.`,
        {
          actorId: user.id,
          targetUserId: user.id,
          targetType: "Auth",
        },
      );
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },

  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          await Logger.log(ActivityAction.USER_LOGGED_IN, "User logged in.", {
            actorId: session.userId,
            targetUserId: session.userId,
            targetType: "Auth",
          });
        },
      },
    },
  },

  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const path = ctx.path;
      if (path !== "/sign-in/email" && path !== "/sign-up/email") return;

      const failed = ctx.context.returned instanceof APIError;
      if (!failed) return;

      const email = (ctx.body as { email?: string } | undefined)?.email ?? null;
      const reason = (ctx.context.returned as APIError).message;

      if (path === "/sign-in/email") {
        await Logger.log(
          ActivityAction.USER_LOGIN_FAILED,
          `Failed login attempt for ${email ?? "unknown"}.`,
          { targetType: "Auth", metadata: { email, reason } },
        );
      } else {
        await Logger.log(
          ActivityAction.USER_REGISTRATION_FAILED,
          `Failed registration attempt for ${email ?? "unknown"}.`,
          { targetType: "Auth", metadata: { email, reason } },
        );
      }
    }),
  },
  plugins: [
    admin({
      defaultRole: "user",
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
