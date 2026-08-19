"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { ParticleBackground } from "@/components/particleBackground";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth-client";
import { getBanInfo } from "../actions/getBanInfo";
import { sessionQueryKey } from "../hooks/use-session";
import { type LoginFormData, loginSchema } from "../schemas";
import { formatBanExpiry } from "../utils/formatBanExpiry";

export function LoginForm({ returnTo }: { returnTo?: string | null }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const destination = returnTo ?? "/dashboard";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const signInMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const result = await signIn.email({
        email: data.email,
        password: data.password,
      });
      if (result.error) {
        if (result.error.code === "BANNED_USER") {
          const ban = await getBanInfo(data.email, data.password);
          throw Object.assign(
            new Error(result.error.message || "Sign in failed"),
            { code: result.error.code, ban },
          );
        }
        throw Object.assign(
          new Error(result.error.message || "Sign in failed"),
          { code: result.error.code },
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionQueryKey });
      router.push(destination);
      router.refresh();
    },
    onError: (error) => {
      const err = error as Error & {
        code?: string;
        ban?: { reason: string | null; expires: string | null } | null;
      };

      if (err.code === "EMAIL_NOT_VERIFIED") {
        toast.error("Email not verified", {
          description:
            "A new verification email has been sent. Please check your inbox.",
        });
        return;
      }

      if (err.code === "BANNED_USER") {
        toast.error("Your account has been banned.", {
          description: (
            <div>
              <p>
                <strong>Reason: </strong>{" "}
                {err.ban?.reason ?? "No reason provided"}
              </p>
              <p>
                <strong>Duration: </strong>
                {formatBanExpiry(err.ban?.expires ?? null)}
              </p>
            </div>
          ),
        });
        return;
      }

      toast.error(err.message);
    },
  });

  const onSubmit = (data: LoginFormData) => {
    signInMutation.mutate(data);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <Link
        href="/"
        className="absolute top-6 left-6 z-10 flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Back
      </Link>

      <div className="absolute inset-0 bg-gradient-to-br from-red-950/50 via-background to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-600/20 via-transparent to-transparent" />

      <ParticleBackground />

      <Card className="relative w-full max-w-md border-primary/20 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex items-center justify-center">
            <Logo size={96} priority className="size-24" />
          </div>
          <CardTitle as="h1" className="text-2xl">
            Welcome back
          </CardTitle>
          <CardDescription>Sign in to your account to continue</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FieldGroup>
              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="rider@example.com"
                  {...register("email")}
                  aria-invalid={!!errors.email}
                />
                <FieldError errors={[errors.email]} />
              </Field>

              <Field data-invalid={!!errors.password}>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Link
                    href="/forgot-password"
                    className="text-sm text-primary hover:text-primary-hover"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  {...register("password")}
                  aria-invalid={!!errors.password}
                />
                <FieldError errors={[errors.password]} />
              </Field>
            </FieldGroup>

            <Button
              type="submit"
              disabled={signInMutation.isPending}
              className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-primary/25 hover:from-red-600 hover:to-red-700"
            >
              {signInMutation.isPending && (
                <Loader2Icon className="mr-2 size-4 animate-spin" />
              )}
              Sign in
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link
              href={
                returnTo
                  ? `/register?returnTo=${encodeURIComponent(returnTo)}`
                  : "/register"
              }
              className="font-medium text-primary hover:text-primary-hover"
            >
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
