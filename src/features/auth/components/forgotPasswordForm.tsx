"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  Loader2Icon,
  MailCheckIcon,
  ZapIcon,
} from "lucide-react";
import Link from "next/link";
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
import { requestPasswordReset } from "@/lib/auth-client";
import { type ForgotPasswordFormData, forgotPasswordSchema } from "../schemas";

export function ForgotPasswordForm() {
  const [emailSent, setEmailSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: ForgotPasswordFormData) => {
      const result = await requestPasswordReset({
        email: data.email,
        redirectTo: "/reset-password",
      });
      if (result.error) {
        throw new Error(result.error.message || "Failed to send reset email");
      }
      return data.email;
    },
    onSuccess: (email) => {
      setSentEmail(email);
      setEmailSent(true);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const onSubmit = (data: ForgotPasswordFormData) => {
    mutation.mutate(data);
  };

  if (emailSent) {
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
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-green-600">
              <MailCheckIcon className="size-7 text-white" />
            </div>
            <CardTitle as="h1" className="text-2xl">
              Check your email
            </CardTitle>
            <CardDescription className="pt-2">
              We sent a password reset link to
            </CardDescription>
            <p className="font-medium text-foreground">{sentEmail}</p>
          </CardHeader>
          <CardContent className="space-y-6 text-center">
            <p className="text-sm text-muted-foreground">
              Click the link in the email to reset your password. The link will
              expire in 1 hour.
            </p>
            <p className="text-sm text-muted-foreground">
              Remember your password?{" "}
              <Link
                href="/login"
                className="font-medium text-primary hover:text-primary-hover"
              >
                Sign in
              </Link>
            </p>
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
            Forgot your password?
          </CardTitle>
          <CardDescription>
            Enter your email and we'll send you a reset link
          </CardDescription>
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
            </FieldGroup>

            <Button
              type="submit"
              disabled={mutation.isPending}
              className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-primary/25 hover:from-red-600 hover:to-red-700"
            >
              {mutation.isPending && (
                <Loader2Icon className="mr-2 size-4 animate-spin" />
              )}
              Send reset link
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Remember your password?{" "}
            <Link
              href="/login"
              className="font-medium text-primary hover:text-primary-hover"
            >
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
