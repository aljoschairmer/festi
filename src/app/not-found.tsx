import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 text-center">
      <Link href="/" aria-label="Festi home">
        <Logo size={56} priority />
      </Link>

      <div className="max-w-md">
        <h1 className="text-6xl font-semibold tracking-tight text-foreground">
          404
        </h1>
        <h2 className="mt-4 text-2xl font-medium text-foreground">
          Page not found
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          The page you are looking for doesn’t exist or may have been removed.
        </p>
      </div>

      <Button asChild>
        <Link href="/">Back to home</Link>
      </Button>
    </main>
  );
}
