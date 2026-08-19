"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { revokeUserSessions } from "../actions/revokeUserSessions";
import { unbanUser } from "../actions/unbanUser";
import { updateUserRole } from "../actions/updateUserRole";
import type { AdminUser } from "../types";
import { BanUserDialog } from "./bannedDialog";

function formatDate(date: string | null) {
  if (!date) return "Never";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

function UserActions({ user }: { user: AdminUser }) {
  const queryClient = useQueryClient();

  const roleMutation = useMutation({
    mutationFn: async (role: string) => {
      const result = await updateUserRole(user.id, role);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(data.message);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async () => {
      const result = await revokeUserSessions(user.id);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },

    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["admin-users"],
      });

      toast.success(data.message);
    },

    onError: (error) => {
      toast.error(error.message);
    },
  });

  const unbanMutation = useMutation({
    mutationFn: async () => {
      const result = await unbanUser(user.id);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(data.message);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const isPending = roleMutation.isPending;

  return (
    <div className="flex items-center gap-2">
      <Select
        value={user.role}
        disabled={isPending}
        onValueChange={(role) => roleMutation.mutate(role)}
      >
        <SelectTrigger className="w-[120px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="user">User</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
        </SelectContent>
      </Select>

      {user.banned ? (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => unbanMutation.mutate()}
        >
          Unban
        </Button>
      ) : (
        <BanUserDialog
          userId={user.id}
          userName={user.name}
          disabled={isPending || user.role === "admin"}
        />
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={isPending || user.role === "admin"}
        onClick={() => revokeMutation.mutate()}
      >
        Revoke Sessions
      </Button>
    </div>
  );
}

export const columns: ColumnDef<AdminUser>[] = [
  {
    accessorKey: "name",
    header: "User",
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.name}</p>
        <p className="text-sm text-muted-foreground">{row.original.email}</p>
      </div>
    ),
  },
  {
    accessorKey: "username",
    header: "Username",
    cell: ({ row }) => row.original.username ?? "-",
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => <span className="capitalize">{row.original.role}</span>,
  },
  {
    accessorKey: "banned",
    header: "Status",
    cell: ({ row }) => {
      const user = row.original;

      if (user.banned) {
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-destructive">Banned</span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{user.banReason || "No reason provided"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }

      return <span className="text-green-500">Active</span>;
    },
  },
  {
    accessorKey: "isOnline",
    header: "Activity",
    cell: ({ row }) =>
      row.original.isOnline ? (
        <span className="text-green-500">Online</span>
      ) : (
        <span className="text-muted-foreground">Offline</span>
      ),
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => formatDate(row.original.createdAt),
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => <UserActions user={row.original} />,
  },
];
