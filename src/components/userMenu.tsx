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
          className="gap-2 text-muted-foreground hover:bg-primary/10 hover:text-foreground"
        >
          {isAdmin ? (
            <ShieldCheckIcon className="size-4 text-primary" />
          ) : (
            <UserIcon className="size-4" />
          )}
          <span className="hidden max-w-32 truncate sm:inline">{userName}</span>
          <ChevronDownIcon className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 border-primary/20">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{userName}</p>
            <p className="text-xs text-muted-foreground">{userEmail}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-primary/20" />
        <DropdownMenuItem
          asChild
          className="cursor-pointer hover:bg-primary/10"
        >
          <Link href="/dashboard/profile">
            <UserIcon className="mr-2 size-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-primary/20" />
        <DropdownMenuItem
          asChild
          disabled={signOutMutation.isPending}
          className="w-full cursor-pointer text-primary hover:bg-primary/10 hover:text-primary focus:text-primary"
        >
          <button type="button" onClick={handleSignOut}>
            <LogOutIcon className="mr-2 size-4" />
            Sign out
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
