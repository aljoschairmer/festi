import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service - Festi",
  description: "The terms and conditions for using the Festi cycling platform.",
};

const LAST_UPDATED = "15 July 2026";

export default function TermsOfServicePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:py-24">
      <div className="mb-10">
        <Link
          href="/"
          className="text-sm text-primary hover:text-primary-hover"
        >
          &larr; Back to home
        </Link>
      </div>

      <article className="space-y-8 text-muted-foreground">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Terms of Service
          </h1>
          <p className="text-sm">Last updated: {LAST_UPDATED}</p>
        </header>

        <section className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-amber-600 dark:text-amber-400">
          This is an unreviewed template and does not constitute legal advice.
          Before going live, have it reviewed by a qualified lawyer and replace
          every <Todo>…</Todo> marker on this page with the operator's actual
          details.
        </section>

        <Section title="1. Scope and Provider">
          <p>
            These Terms of Service ("Terms") govern the use of the Festi
            platform ("Service"), operated by{" "}
            <Todo>operator name, legal form and address</Todo> ("we", "us"). By
            creating an account or using the Service, you agree to these Terms.
          </p>
        </Section>

        <Section title="2. The Service">
          <p>
            Festi is an online platform for cyclists to plan rides, connect with
            other riders, form groups, and share routes. We may modify, extend,
            or discontinue features of the Service at any time.
          </p>
        </Section>

        <Section title="3. Registration and Account">
          <ul className="list-disc space-y-1 pl-6">
            <li>You must be at least 16 years old to use the Service.</li>
            <li>
              You must provide accurate information and keep your credentials
              confidential.
            </li>
            <li>
              You are responsible for all activity that occurs under your
              account.
            </li>
            <li>
              We may verify your email address before granting full access.
            </li>
          </ul>
        </Section>

        <Section title="4. User Conduct">
          <p>You agree not to:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              post unlawful, offensive, infringing, or misleading content;
            </li>
            <li>harass, threaten, or impersonate others;</li>
            <li>
              interfere with the security or proper functioning of the Service;
            </li>
            <li>
              use the Service for unauthorised commercial or automated purposes.
            </li>
          </ul>
        </Section>

        <Section title="5. User Content">
          <p>
            You retain ownership of content you submit. You grant us a
            non-exclusive, worldwide, royalty-free licence to host, display, and
            process your content solely to operate and provide the Service. You
            are responsible for ensuring you have the rights to the content you
            upload.
          </p>
        </Section>

        <Section title="6. Rides and Safety">
          <p>
            Rides, routes, and meeting points are created by users. Cycling
            involves inherent risks. You participate at your own risk, are
            responsible for your own safety and compliance with traffic laws,
            and we do not organise, supervise, or guarantee any ride or route.
          </p>
        </Section>

        <Section title="7. Availability">
          <p>
            We aim to keep the Service available but do not guarantee
            uninterrupted or error-free operation. Maintenance, updates, or
            technical issues may cause temporary downtime.
          </p>
        </Section>

        <Section title="8. Termination">
          <p>
            You may delete your account at any time. We may suspend or terminate
            accounts that violate these Terms or applicable law, with notice
            where reasonable.
          </p>
        </Section>

        <Section title="9. Liability">
          <p>
            We are liable without limitation for intent and gross negligence and
            for damages arising from injury to life, body, or health. For slight
            negligence, we are only liable for breach of a material contractual
            obligation (cardinal obligation), limited to the foreseeable,
            typical damage. Any further liability is excluded to the extent
            permitted by law. Mandatory statutory liability, including under the
            German Product Liability Act, remains unaffected.
          </p>
        </Section>

        <Section title="10. Privacy">
          <p>
            Information about how we process your personal data is set out in
            our{" "}
            <Link
              href="/privacy"
              className="text-primary hover:text-primary-hover"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </Section>

        <Section title="11. Changes to these Terms">
          <p>
            We may amend these Terms where necessary. We will notify you of
            material changes in an appropriate manner. Continued use of the
            Service after changes take effect constitutes acceptance.
          </p>
        </Section>

        <Section title="12. Governing Law and Jurisdiction">
          <p>
            These Terms are governed by the laws of the Federal Republic of
            Germany, excluding the UN Convention on Contracts for the
            International Sale of Goods. Mandatory consumer protection
            provisions of your country of residence remain unaffected. Where
            permitted, the place of jurisdiction is our registered seat.
          </p>
        </Section>

        <Section title="13. Contact">
          <p>
            Questions about these Terms: <Todo>operator contact email</Todo>.
          </p>
        </Section>
      </article>
    </main>
  );
}

/**
 * Visible placeholder for details the operator must fill in before launch.
 * Renders highlighted so missing entries cannot be overlooked.
 */
function Todo({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-600 dark:text-amber-400">
      [TODO: {children}]
    </span>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}
