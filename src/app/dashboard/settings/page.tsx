import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChangePasswordForm } from "@/features/auth/components/changePasswordForm";
import { requireAuth } from "@/features/auth/guards";

export default async function SettingsPage() {
  const session = await requireAuth();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account</p>
      </div>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your sign-in details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Email: </span>
            {session.user.email}
          </p>
          <p>
            <span className="text-muted-foreground">Name: </span>
            {session.user.name}
          </p>
          <p className="text-muted-foreground">
            Rider details (bio, bike, styles) live on your{" "}
            <Link
              href="/dashboard/profile"
              className="text-primary underline-offset-4 hover:underline"
            >
              profile page
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            Signs out all other sessions after the change
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
