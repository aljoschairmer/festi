"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeftIcon, Loader2Icon, MailCheckIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { registerUser } from "../actions/registerUser";
import { type RegisterFormData, registerSchema } from "../schemas";

export function RegisterForm({ returnTo }: { returnTo?: string | null }) {
  const [verificationSent, setVerificationSent] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string>("");
  const loginHref = returnTo
    ? `/login?returnTo=${encodeURIComponent(returnTo)}`
    : "/login";

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      terms: false,
    },
  });

  const termsValue = watch("terms");

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterFormData) => {
      const result = await registerUser(data);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.email;
    },
    onSuccess: (email) => {
      setRegisteredEmail(email);
      setVerificationSent(true);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const onSubmit = (data: RegisterFormData) => {
    registerMutation.mutate(data);
  };

  // Show verification sent state
  if (verificationSent) {
    return (
      <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
        {/* Back Arrow */}
        <Link
          href="/"
          className="absolute top-6 left-6 z-10 flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Back
        </Link>

        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-red-950/50 via-background to-black" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-600/20 via-transparent to-transparent" />

        {/* Interactive Particles */}
        <ParticleBackground />

        <Card className="relative w-full max-w-md border-red-500/20 backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-green-600">
              <MailCheckIcon className="size-7 text-white" />
            </div>
            <CardTitle className="text-2xl">Check your email</CardTitle>
            <CardDescription className="pt-2">
              If that email isn't already registered, we've sent a verification
              link to
            </CardDescription>
            <p className="font-medium text-foreground">{registeredEmail}</p>
          </CardHeader>
          <CardContent className="space-y-6 text-center">
            <p className="text-sm text-muted-foreground">
              Click the link in the email to verify your account and join the
              cycling community. The link will expire in 24 hours.
            </p>
            <p className="text-sm text-muted-foreground">
              Already verified?{" "}
              <Link
                href={loginHref}
                className="font-medium text-red-500 hover:text-red-400"
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
      {/* Back Arrow */}
      <Link
        href="/"
        className="absolute top-6 left-6 z-10 flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Back
      </Link>

      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-red-950/50 via-background to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-600/20 via-transparent to-transparent" />

      {/* Interactive Particles */}
      <ParticleBackground />

      <Card className="relative w-full max-w-md border-red-500/20 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex items-center justify-center">
            <Logo size={96} priority className="size-24" />
          </div>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>Join the cycling community today</CardDescription>
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.firstName}>
                <FieldLabel htmlFor="firstName">First name</FieldLabel>
                <Input
                  id="firstName"
                  type="text"
                  placeholder="John"
                  {...register("firstName")}
                  aria-invalid={!!errors.firstName}
                />
                <FieldError errors={[errors.firstName]} />
              </Field>
              <Field data-invalid={!!errors.lastName}>
                <FieldLabel htmlFor="lastName">Last name</FieldLabel>
                <Input
                  id="lastName"
                  type="text"
                  placeholder="Doe"
                  {...register("lastName")}
                  aria-invalid={!!errors.lastName}
                />
                <FieldError errors={[errors.lastName]} />
              </Field>
            </div>
            <FieldGroup>
              <Field data-invalid={!!errors.username}>
                <FieldLabel htmlFor="username">Username</FieldLabel>
                <Input
                  id="username"
                  type="text"
                  placeholder="speedster"
                  {...register("username")}
                  aria-invalid={!!errors.username}
                />
                <FieldError errors={[errors.username]} />
              </Field>
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
                <FieldLabel htmlFor="password">Password</FieldLabel>
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
                  Confirm password
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
              <Field
                orientation="horizontal"
                data-invalid={!!errors.terms}
                className="items-start"
              >
                <Checkbox
                  id="terms"
                  checked={termsValue}
                  onCheckedChange={(checked) =>
                    setValue("terms", checked === true, {
                      shouldValidate: true,
                    })
                  }
                  className="mt-1"
                  aria-invalid={!!errors.terms}
                />
                <div className="space-y-1">
                  <FieldLabel
                    htmlFor="terms"
                    className="text-sm font-normal leading-relaxed"
                  >
                    I agree to the{" "}
                    <Link
                      href="/terms"
                      className="text-red-500 hover:text-red-400"
                    >
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link
                      href="/privacy"
                      className="text-red-500 hover:text-red-400"
                    >
                      Privacy Policy
                    </Link>
                  </FieldLabel>
                  <FieldError errors={[errors.terms]} />
                </div>
              </Field>
            </FieldGroup>

            <Button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25 hover:from-red-600 hover:to-red-700"
            >
              {registerMutation.isPending && (
                <Loader2Icon className="mr-2 size-4 animate-spin" />
              )}
              Create account
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href={loginHref}
              className="font-medium text-red-500 hover:text-red-400"
            >
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
