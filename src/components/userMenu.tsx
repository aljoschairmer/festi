"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  LogOutIcon,
  ShieldCheckIcon,
  UserIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sessionQueryKey } from "@/features/auth/hooks/use-session";
import { signOut } from "@/lib/auth-client";

interface UserMenuProps {
  userName: string;
  userEmail: string;
  userRole: string;
}

export function UserMenu({ userName, userEmail, userRole }: UserMenuProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isAdmin = userRole === "admin";

  const signOutMutation = useMutation({
    mutationFn: () => signOut(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionQueryKey });
      router.push("/");
      router.refresh();
    },
  });

  const handleSignOut = () => {
    signOutMutation.mutate();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:bg-red-500/10 hover:text-foreground"
        >
          {isAdmin ? (
            <ShieldCheckIcon className="size-4 text-red-500" />
          ) : (
            <UserIcon className="size-4" />
          )}
          <span className="hidden max-w-32 truncate sm:inline">{userName}</span>
          <ChevronDownIcon className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 border-red-500/20">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{userName}</p>
            <p className="text-xs text-muted-foreground">{userEmail}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-red-500/20" />
        <DropdownMenuItem
          asChild
          className="cursor-pointer hover:bg-red-500/10"
        >
          <Link href="/dashboard/profile">
            <UserIcon className="mr-2 size-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-red-500/20" />
        <DropdownMenuItem
          onClick={handleSignOut}
          disabled={signOutMutation.isPending}
          className="cursor-pointer text-red-500 hover:bg-red-500/10 hover:text-red-500 focus:text-red-500"
        >
          <LogOutIcon className="mr-2 size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
