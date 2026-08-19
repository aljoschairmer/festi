import { RegisterForm } from "@/features/auth";
import { sanitizeReturnTo } from "@/features/auth/utils/returnTo";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  return (
    // The skip link targets this landmark; without it the page has no `main`.
    <main id="main-content" tabIndex={-1}>
      <RegisterForm returnTo={sanitizeReturnTo(returnTo)} />
    </main>
  );
}
