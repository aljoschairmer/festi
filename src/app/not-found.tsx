import Link from "next/link";
import NotFoundComponent from "@/components/notFoundComponent";
import { Button } from "@/components/ui/button";

/**
 * Site-wide 404. Without this file Next serves its unbranded default page,
 * which has no header, no logo and no way back.
 */
export default function NotFound() {
  return (
    <main>
      <NotFoundComponent />
      <div className="flex justify-center pb-16">
        <Button asChild variant="outline">
          <Link href="/">Back to Festi</Link>
        </Button>
      </div>
    </main>
  );
}
