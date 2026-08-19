import Link from "next/link";
import NotFoundComponent from "@/components/notFoundComponent";
import { Button } from "@/components/ui/button";

/** 404 inside the dashboard — keeps the sidebar and header in place. */
export default function DashboardNotFound() {
  return (
    <>
      <NotFoundComponent />
      <div className="flex justify-center">
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to your feed</Link>
        </Button>
      </div>
    </>
  );
}
