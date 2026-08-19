import Link from "next/link";
import { CookieConsent } from "@/components/cookieConsent";
import { ParticleBackground } from "@/components/particleBackground";
import { SiteFooter } from "@/components/siteFooter";
import { TypedHeadline } from "@/components/typedHeadline";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="relative flex min-h-screen items-center justify-center overflow-hidden"
    >
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-red-900/70 via-background to-red-950/50" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-red-600/40 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-red-600/30 via-transparent to-transparent" />

      {/* Interactive Particles */}
      <ParticleBackground />

      <div className="relative mx-auto max-w-4xl px-4 text-center">
        <TypedHeadline />
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
          Your all-in-one platform for cyclists. Plan new rides, connect with
          fellow riders, and explore new routes.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button
            size="lg"
            asChild
            className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25 hover:from-red-600 hover:to-red-700 sm:w-auto"
          >
            <Link href="/register">Get started free</Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            asChild
            className="w-full sm:w-auto"
          >
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>

      <SiteFooter className="absolute inset-x-0 bottom-0 z-10 mx-auto max-w-4xl px-4 pb-6" />

      <CookieConsent />
    </main>
  );
}
