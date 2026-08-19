import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Imprint - Festi",
  description:
    "Legal notice (Impressum) for Festi in accordance with § 5 TMG and Art. 10 MDStV.",
};

export default function ImprintPage() {
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
            Imprint
          </h1>
          <p className="text-sm">
            Legal notice in accordance with &sect; 5 TMG (German Telemedia Act)
            and Art. 10 MDStV.
          </p>
        </header>

        <Section title="Service operator">
          <p className="font-medium text-foreground">Festi</p>
          <p>
            Postal address: Available on request via{" "}
            <a
              href="mailto:info@festicycling.com"
              className="text-primary hover:text-primary-hover"
            >
              info@festicycling.com
            </a>
          </p>
          <p>
            Contact:{" "}
            <a
              href="mailto:info@festicycling.com"
              className="text-primary hover:text-primary-hover"
            >
              info@festicycling.com
            </a>
          </p>
          <p>
            Technical enquiries &amp; support:{" "}
            <a
              href="mailto:info@festicycling.com"
              className="text-primary hover:text-primary-hover"
            >
              info@festicycling.com
            </a>
          </p>
        </Section>

        <Section title="Responsible for content">
          <p>
            The person responsible for the content of this service in accordance
            with &sect; 55 Abs. 2 RStV is the operator listed above.
          </p>
        </Section>

        <Section title="Disclaimer of liability">
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">Content</h3>
              <p>
                The content of this website has been compiled with the greatest
                possible care. However, we cannot guarantee the accuracy,
                completeness, or timeliness of the information provided. As a
                service provider, we are responsible for our own content on this
                website under general law (&sect; 7 Abs. 1 TMG). According to
                &sect;&sect; 8&ndash;10 TMG, however, we are not obligated to
                monitor transmitted or stored third-party information or to
                investigate circumstances indicating illegal activity.
                Obligations to remove or block the use of information in
                accordance with general legislation remain unaffected. Any
                liability in this regard is only incurred from the point in time
                at which a specific infringement of the law becomes known.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">External links</h3>
              <p>
                This website may contain links to external third-party websites
                whose content is beyond our control. Therefore, we cannot accept
                any liability for this third-party content. The respective
                provider or operator of the pages is always responsible for the
                content of the linked pages. The linked pages were checked for
                possible legal violations at the time of linking. Illegal
                content was not identifiable at the time of linking. A permanent
                content control of the linked pages is, however, not reasonable
                without concrete indications of an infringement. If we become
                aware of any infringements, we will remove such links
                immediately.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">Copyright</h3>
              <p>
                The content and works on this website created by the site
                operators are subject to German copyright law. Duplication,
                processing, distribution, or any form of commercialisation of
                such material beyond the scope of the copyright law requires the
                prior written consent of the respective author or creator.
                Downloads and copies of this website are only permitted for
                private, non-commercial use.
              </p>
            </div>
          </div>
        </Section>

        <Section title="Data protection">
          <p>
            For information on how we handle personal data, please see our{" "}
            <Link
              href="/privacy"
              className="text-primary hover:text-primary-hover"
            >
              Privacy Policy
            </Link>
            . Questions regarding data protection can be sent to{" "}
            <a
              href="mailto:info@festicycling.com"
              className="text-primary hover:text-primary-hover"
            >
              info@festicycling.com
            </a>
            .
          </p>
        </Section>
      </article>
    </main>
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
