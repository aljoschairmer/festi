import { Resend } from "resend";

// Fail loudly at boot when email is not configured: better-auth swallows
// send-hook errors, so without this warning users register "successfully"
// but never receive their verification email and are locked out silently.
if (!process.env.RESEND_API_KEY) {
  console.warn(
    "[email] RESEND_API_KEY is not set — verification and password-reset " +
      "emails will NOT be sent, and new users will be unable to verify " +
      "their accounts. Set RESEND_API_KEY to enable transactional email.",
  );
}

// Lazy initialization to avoid build-time errors when API key is not set
let resend: Resend | null = null;

function getResendClient(): Resend {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY environment variable is not set");
    }
    resend = new Resend(apiKey);
  }
  return resend;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions) {
  const client = getResendClient();

  // Use Resend's test sender for development (can only send to your own email)
  // For production, set EMAIL_FROM to your verified domain email
  const from = process.env.EMAIL_FROM || "Festi <onboarding@resend.dev>";

  const { data, error } = await client.emails.send({
    from,
    to,
    subject,
    html,
  });

  if (error) {
    console.error("Failed to send email:", error);
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data;
}

/**
 * Escapes user-controlled text before it goes into an HTML mail body.
 * `userName` comes straight from the registration form, so without this a
 * name can inject markup (or a link) into mail we send in Festi's name.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getVerificationEmailHtml(url: string, userName: string) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Verify your email - Festi</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0a0a0a; color: #ffffff; margin: 0; padding: 40px 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: linear-gradient(135deg, #1a0505 0%, #0a0a0a 100%); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 16px; padding: 40px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="display: inline-block; width: 48px; height: 48px; background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); border-radius: 12px; line-height: 48px; font-size: 24px;">🚴</div>
            <h1 style="margin: 16px 0 0; font-size: 24px; font-weight: bold;">FESTI</h1>
          </div>
          
          <h2 style="margin: 0 0 16px; font-size: 20px; text-align: center;">Verify your email address</h2>
          
          <p style="color: #a1a1aa; margin: 0 0 24px; text-align: center;">
            Hey ${escapeHtml(userName)}, welcome to the cycling community! Click the button below to verify your email and start planning your next ride.
          </p>
          
          <div style="text-align: center; margin: 32px 0;">
            <a href="${url}" style="display: inline-block; background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
              Verify Email
            </a>
          </div>
          
          <p style="color: #71717a; font-size: 14px; text-align: center; margin: 24px 0 0;">
            If you didn't create an account with Festi, you can safely ignore this email.
          </p>
          
          <hr style="border: none; border-top: 1px solid rgba(239, 68, 68, 0.2); margin: 32px 0;">
          
          <p style="color: #52525b; font-size: 12px; text-align: center; margin: 0;">
            This link will expire in 24 hours.
          </p>
        </div>
      </body>
    </html>
  `;
}

export function getPasswordResetEmailHtml(url: string, userName: string) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Reset your password - Festi</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0a0a0a; color: #ffffff; margin: 0; padding: 40px 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: linear-gradient(135deg, #1a0505 0%, #0a0a0a 100%); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 16px; padding: 40px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="display: inline-block; width: 48px; height: 48px; background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); border-radius: 12px; line-height: 48px; font-size: 24px;">🚴</div>
            <h1 style="margin: 16px 0 0; font-size: 24px; font-weight: bold;">FESTI</h1>
          </div>
          
          <h2 style="margin: 0 0 16px; font-size: 20px; text-align: center;">Reset your password</h2>
          
          <p style="color: #a1a1aa; margin: 0 0 24px; text-align: center;">
            Hey ${escapeHtml(userName)}, we received a request to reset your password. Click the button below to choose a new password.
          </p>
          
          <div style="text-align: center; margin: 32px 0;">
            <a href="${url}" style="display: inline-block; background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
              Reset Password
            </a>
          </div>
          
          <p style="color: #71717a; font-size: 14px; text-align: center; margin: 24px 0 0;">
            If you didn't request a password reset, you can safely ignore this email.
          </p>
          
          <hr style="border: none; border-top: 1px solid rgba(239, 68, 68, 0.2); margin: 32px 0;">
          
          <p style="color: #52525b; font-size: 12px; text-align: center; margin: 0;">
            This link will expire in 1 hour.
          </p>
        </div>
      </body>
    </html>
  `;
}

export function getExistingAccountEmailHtml(userName: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Someone tried to sign up with your email - Festi</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0a0a0a; color: #ffffff; margin: 0; padding: 40px 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: linear-gradient(135deg, #1a0505 0%, #0a0a0a 100%); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 16px; padding: 40px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="display: inline-block; width: 48px; height: 48px; background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); border-radius: 12px; line-height: 48px; font-size: 24px;">🚴</div>
            <h1 style="margin: 16px 0 0; font-size: 24px; font-weight: bold;">FESTI</h1>
          </div>

          <h2 style="margin: 0 0 16px; font-size: 20px; text-align: center;">Someone tried to sign up with your email</h2>

          <p style="color: #a1a1aa; margin: 0 0 24px; text-align: center;">
            Hey ${escapeHtml(userName)}, we received a sign-up attempt using this email address, but you already have a Festi account. No new account was created and nothing has changed.
          </p>

          <p style="color: #a1a1aa; margin: 0 0 24px; text-align: center;">
            If this was you, just sign in as usual. If you've forgotten your password, you can reset it below.
          </p>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${appUrl}/login" style="display: inline-block; background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
              Sign in
            </a>
          </div>

          <p style="color: #71717a; font-size: 14px; text-align: center; margin: 24px 0 0;">
            If this wasn't you, you can safely ignore this email — your account remains secure.
          </p>

          <hr style="border: none; border-top: 1px solid rgba(239, 68, 68, 0.2); margin: 32px 0;">

          <p style="color: #52525b; font-size: 12px; text-align: center; margin: 0;">
            <a href="${appUrl}/forgot-password" style="color: #ef4444; text-decoration: none;">Reset your password</a>
          </p>
        </div>
      </body>
    </html>
  `;
}
