import { LoginForm } from "@/features/auth";
import { sanitizeReturnTo } from "@/features/auth/utils/returnTo";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  return (
    // The skip link targets this landmark; without it the page has no `main`.
    <main id="main-content" tabIndex={-1}>
      <LoginForm returnTo={sanitizeReturnTo(returnTo)} />
    </main>
  );
}
