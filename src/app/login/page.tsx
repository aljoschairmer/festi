import { LoginForm } from "@/features/auth";
import { sanitizeReturnTo } from "@/features/auth/utils/returnTo";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  return <LoginForm returnTo={sanitizeReturnTo(returnTo)} />;
}
