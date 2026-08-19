import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Imprint - Festi",
  description: "Legal notice (Impressum) for Festi in accordance with § 5 DDG.",
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
            Legal notice in accordance with &sect; 5 DDG
            (Digitale-Dienste-Gesetz).
          </p>
        </header>

        {/* TODO(Betreiber): Dieses Impressum ist unvollständig. Alle
            [TODO: ...]-Marker durch die echten Betreiberangaben ersetzen,
            bevor die Seite öffentlich betrieben wird. */}
        <section className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-amber-600 dark:text-amber-400">
          This imprint is incomplete. Replace every <Todo>…</Todo> marker with
          the operator's actual details before operating this service publicly.
        </section>

        <Section title="Information pursuant to § 5 DDG">
          <p className="font-medium text-foreground">Festi</p>
          {/* TODO(Betreiber): Vollständigen Namen bzw. Firmennamen und
              Rechtsform des Betreibers eintragen (§ 5 Abs. 1 Nr. 1 DDG). */}
          <p>
            Operator: <Todo>full name / company name and legal form</Todo>
          </p>
          {/* TODO(Betreiber): Ladungsfähige Anschrift eintragen — Straße,
              Hausnummer, PLZ, Ort (§ 5 Abs. 1 Nr. 2 DDG). Eine Anschrift
              "auf Anfrage" genügt den Anforderungen nicht. */}
          <p>
            Postal address:{" "}
            <Todo>serviceable address (street, number, postal code, city)</Todo>
          </p>
          {/* TODO(Betreiber): Bei juristischen Personen die
              vertretungsberechtigte Person nennen (§ 5 Abs. 1 Nr. 3 DDG). */}
          <p>
            Authorised representative:{" "}
            <Todo>authorised representative (for legal entities)</Todo>
          </p>
          <p>
            Contact:{" "}
            <a
              href="mailto:info@festicycling.com"
              className="text-primary hover:text-primary-hover"
            >
              info@festicycling.com
            </a>
            {/* TODO(Betreiber): Ggf. Telefonnummer für eine schnelle
                Kontaktaufnahme ergänzen (§ 5 Abs. 1 Nr. 2 DDG). */}{" "}
            <Todo>optional: phone number for immediate contact</Todo>
          </p>
        </Section>

        <Section title="Responsible for content">
          {/* TODO(Betreiber): Name und Anschrift der/des Verantwortlichen
              nach § 18 Abs. 2 MStV eintragen. */}
          <p>
            Responsible for the content of this service pursuant to &sect; 18
            Abs. 2 MStV: <Todo>name and address of the responsible person</Todo>
            .
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
                website under general law (&sect; 7 Abs. 1 DDG). According to
                &sect;&sect; 8&ndash;10 DDG, however, we are not obligated to
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
