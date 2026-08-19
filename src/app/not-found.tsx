import Link from "next/link";
import { Logo } from "@/components/logo";
import NotFoundComponent from "@/components/notFoundComponent";
import { Button } from "@/components/ui/button";

/**
 * Site-wide 404. Without this file Next serves its unbranded default page,
 * which has no header, no logo and no way back.
 *
 * The copy lives in `NotFoundComponent` because the rides segment renders the
 * same thing; the logo and the button are what make this the full-page
 * version rather than an embedded one.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 text-center">
      <Link href="/" aria-label="Festi home">
        <Logo size={56} priority />
      </Link>

      <NotFoundComponent />

      <Button asChild>
        <Link href="/">Back to home</Link>
      </Button>
    </main>
  );
}
