"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  Loader2Icon,
  ZapIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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
import { resetPassword } from "@/lib/auth-client";
import { type ResetPasswordFormData, resetPasswordSchema } from "../schemas";

export function ResetPasswordForm() {
  const [resetComplete, setResetComplete] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: ResetPasswordFormData) => {
      if (!token) {
        throw new Error("Invalid or missing reset token");
      }

      const result = await resetPassword({
        newPassword: data.password,
        token,
      });

      if (result.error) {
        throw new Error(result.error.message || "Failed to reset password");
      }
    },
    onSuccess: () => {
      setResetComplete(true);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const onSubmit = (data: ResetPasswordFormData) => {
    mutation.mutate(data);
  };

  if (!token) {
    return (
      <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
        <div className="absolute inset-0 bg-gradient-to-br from-red-950/50 via-background to-black" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-600/20 via-transparent to-transparent" />

        <ParticleBackground />

        <Card className="relative w-full max-w-md border-primary/20 backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-700">
              <ZapIcon className="size-6 text-white" />
            </div>
            <CardTitle as="h1" className="text-2xl">
              Invalid link
            </CardTitle>
            <CardDescription>
              This password reset link is invalid or has expired
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link
              href="/forgot-password"
              className="font-medium text-primary hover:text-primary-hover"
            >
              Request a new reset link
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (resetComplete) {
    return (
      <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
        <div className="absolute inset-0 bg-gradient-to-br from-red-950/50 via-background to-black" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-600/20 via-transparent to-transparent" />

        <ParticleBackground />

        <Card className="relative w-full max-w-md border-primary/20 backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-green-600">
              <CheckCircleIcon className="size-7 text-white" />
            </div>
            <CardTitle as="h1" className="text-2xl">
              Password reset!
            </CardTitle>
            <CardDescription className="pt-2">
              Your password has been successfully reset
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 text-center">
            <Button
              onClick={() => router.push("/login")}
              className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-primary/25 hover:from-red-600 hover:to-red-700"
            >
              Sign in with new password
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <Link
        href="/login"
        className="absolute top-6 left-6 z-10 flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Back to login
      </Link>

      <div className="absolute inset-0 bg-gradient-to-br from-red-950/50 via-background to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-600/20 via-transparent to-transparent" />

      <ParticleBackground />

      <Card className="relative w-full max-w-md border-primary/20 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-700">
            <ZapIcon className="size-6 text-white" />
          </div>
          <CardTitle as="h1" className="text-2xl">
            Reset your password
          </CardTitle>
          <CardDescription>Enter your new password below</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form
            onSubmit={handleSubmit(onSubmit, () => {
              const firstError = Object.values(errors)[0];
              if (firstError?.message) {
                toast.error(firstError.message);
              }
            })}
            className="space-y-4"
          >
            <FieldGroup>
              <Field data-invalid={!!errors.password}>
                <FieldLabel htmlFor="password">New password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  {...register("password")}
                  aria-invalid={!!errors.password}
                />
                <FieldError errors={[errors.password]} />
              </Field>
              <Field data-invalid={!!errors.confirmPassword}>
                <FieldLabel htmlFor="confirmPassword">
                  Confirm new password
                </FieldLabel>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  {...register("confirmPassword")}
                  aria-invalid={!!errors.confirmPassword}
                />
                <FieldError errors={[errors.confirmPassword]} />
              </Field>
            </FieldGroup>

            <Button
              type="submit"
              disabled={mutation.isPending}
              className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-primary/25 hover:from-red-600 hover:to-red-700"
            >
              {mutation.isPending && (
                <Loader2Icon className="mr-2 size-4 animate-spin" />
              )}
              Reset password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
