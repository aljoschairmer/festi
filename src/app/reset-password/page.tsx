import { Suspense } from "react";
import { ResetPasswordForm } from "@/features/auth";

export default function ResetPasswordPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center">
            Loading...
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
