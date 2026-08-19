"use client";

import {
  BarChart3Icon,
  BellIcon,
  BikeIcon,
  CalendarDaysIcon,
  HomeIcon,
  NewspaperIcon,
  SettingsIcon,
  TrophyIcon,
  UserCogIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const contentItems: NavItem[] = [
  { label: "For You", href: "/dashboard", icon: HomeIcon },

  { label: "Community", href: "/dashboard/community", icon: UsersIcon },
  {
    label: "Community Rides",
    href: "/dashboard/community-rides",
    icon: BikeIcon,
  },
  { label: "Pro Racing", href: "/dashboard/pro", icon: TrophyIcon },
  { label: "Events", href: "/dashboard/events", icon: CalendarDaysIcon },
  { label: "News", href: "/dashboard/news", icon: NewspaperIcon },
];

const settingsItems: NavItem[] = [
  { label: "Profile", href: "/dashboard/profile", icon: UserIcon },
  { label: "Notifications", href: "/dashboard/notifications", icon: BellIcon },
  { label: "Settings", href: "/dashboard/settings", icon: SettingsIcon },
];

const adminItems: NavItem[] = [
  {
    label: "Analytics",
    href: "/dashboard/admin/analytics",
    icon: BarChart3Icon,
  },
  {
    label: "User Management",
    href: "/dashboard/admin/users",
    icon: UserCogIcon,
  },
];

interface AppSidebarProps {
  userRole: string;
}

export function AppSidebar({ userRole }: AppSidebarProps) {
  const pathname = usePathname();
  const isAdmin = userRole === "admin";

  const renderNavItems = (items: NavItem[]) => (
    <SidebarMenu>
      {items.map((item) => {
        const isActive = pathname === item.href;
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              isActive={isActive}
              className={
                isActive
                  ? "bg-red-500/20 text-red-500 hover:bg-red-500/30 hover:text-red-500"
                  : "hover:bg-red-500/10"
              }
            >
              <Link href={item.href}>
                <item.icon className="size-4" />
                <span>{item.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );

  return (
    <Sidebar className="border-r border-red-500/20">
      {/* Header */}
      <SidebarHeader className="h-14 justify-center border-b border-red-500/20 px-4">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold tracking-tight">FESTI</span>
          {isAdmin && (
            <span className="ml-auto rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-500">
              Admin
            </span>
          )}
        </div>
      </SidebarHeader>

      {/* Main Content */}
      <SidebarContent>
        {/* Content Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground">
            Content
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {renderNavItems(contentItems)}
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Settings Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground">
            Account
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {renderNavItems(settingsItems)}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer - Admin section at bottom */}
      {isAdmin && (
        <SidebarFooter className="mt-auto">
          <SidebarGroup className="border-t border-red-500/20 pt-2">
            <SidebarGroupLabel className="text-red-500/70">
              Administration
            </SidebarGroupLabel>
            <SidebarGroupContent>
              {renderNavItems(adminItems)}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
