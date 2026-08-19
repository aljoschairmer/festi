import { RegisterForm } from "@/features/auth";
import { sanitizeReturnTo } from "@/features/auth/utils/returnTo";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  return <RegisterForm returnTo={sanitizeReturnTo(returnTo)} />;
}
