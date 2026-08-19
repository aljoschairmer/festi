import HeaderButtonGroup from "@/components/headerButtonGroup";
import { AppSidebar } from "@/components/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { UserMenu } from "@/components/userMenu";
import { requireAuth } from "@/features/auth/guards";
import { PresenceHeartbeat } from "@/features/followers/components/presenceHeartbeat";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();

  return (
    <SidebarProvider>
      <PresenceHeartbeat />
      <AppSidebar userRole={session.user.role || "user"} />
      <SidebarInset className="bg-background">
        <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-2 border-b border-red-500/20 bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 h-4 bg-red-500/20"
          />
          <span className="text-sm text-muted-foreground">Dashboard</span>
          <div className="flex items-center gap-2 ml-auto">
            <HeaderButtonGroup />
            <UserMenu
              userName={session.user.name || "User"}
              userEmail={session.user.email}
              userRole={session.user.role || "user"}
            />
          </div>
        </header>

        {/* SidebarInset already renders the <main> landmark. */}
        <div id="main-content" tabIndex={-1} className="flex-1 p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
