"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/admin/data-table";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAdminUsers, useUpdateUser, useToggleUserStatus } from "@/features/admin/hooks";
import type { AdminUser } from "@/features/admin/types";
import { toast } from "sonner";
import { Pencil, ShieldAlert, ShieldCheck } from "lucide-react";

export default function AdminUsersPage() {
  const [filters, setFilters] = useState<{ search?: string; role?: string; status?: string }>({});
  const { data: usersData, isLoading } = useAdminUsers(filters);
  const users: AdminUser[] = usersData?.data ?? usersData ?? [];
  const updateUser = useUpdateUser();
  const toggleStatus = useToggleUserStatus();

  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({ displayName: "", email: "", role: "" as string });
  const [confirmToggle, setConfirmToggle] = useState<AdminUser | null>(null);

  const openEdit = (user: AdminUser) => {
    setEditUser(user);
    setEditForm({ displayName: user.displayName ?? "", email: user.email, role: user.role });
  };

  const saveEdit = () => {
    if (!editUser) return;
    updateUser.mutate(
      { id: editUser.id, partial: { displayName: editForm.displayName, role: editForm.role as "ADMIN" | "STUDENT" } },
      { onSuccess: () => { toast.success("User updated successfully"); setEditUser(null); } }
    );
  };

  const handleToggle = () => {
    if (!confirmToggle) return;
    toggleStatus.mutate(confirmToggle.id, {
      onSuccess: () => { toast.success(`User ${confirmToggle.isActive ? "disabled" : "enabled"} successfully`); setConfirmToggle(null); },
    });
  };

  const columns: ColumnDef<AdminUser, unknown>[] = [
    {
      accessorKey: "displayName",
      header: "Student",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 ring-2 ring-primary/10">
            <AvatarImage src={row.original.avatarUrl ?? undefined} />
            <AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-semibold">{(row.original.displayName ?? "??").slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-semibold text-foreground">{row.original.displayName}</p>
            <p className="text-xs text-muted-foreground">{row.original.email}</p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ getValue }) => {
        const role = getValue() as string;
        return (
          <Badge className={role === "ADMIN"
            ? "bg-[#EEF2FF] text-[#4F46E5] hover:bg-[#EEF2FF] dark:bg-[#1E1B4B] dark:text-[#818CF8]"
            : "bg-[#F0FDFA] text-[#0D9488] hover:bg-[#F0FDFA] dark:bg-[#134E4A] dark:text-[#2DD4BF]"
          }>
            {role}
          </Badge>
        );
      },
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ getValue }) => {
        const active = getValue() as boolean;
        return (
          <Badge className={active
            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400"
            : "bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400"
          }>
            {active ? "Active" : "Disabled"}
          </Badge>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Joined",
      cell: ({ getValue }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(getValue() as string).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 cursor-pointer hover:bg-secondary" onClick={() => openEdit(row.original)}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 cursor-pointer hover:bg-secondary" onClick={() => setConfirmToggle(row.original)}>
            {row.original.isActive ? <ShieldAlert className="w-4 h-4 text-destructive" /> : <ShieldCheck className="w-4 h-4 text-emerald-600" />}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader title="User Management" description="Manage platform students and administrators" />

      <DataTable
        columns={columns}
        data={users ?? []}
        searchKey="displayName"
        searchPlaceholder="Search by name..."
        isLoading={isLoading}
        filterBar={
          <div className="flex gap-2">
            <Select value={filters.role ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, role: v === "all" ? undefined : v }))}>
              <SelectTrigger className="w-[130px] border-0 bg-card shadow-sm h-10"><SelectValue placeholder="Role" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Roles</SelectItem><SelectItem value="ADMIN">Admin</SelectItem><SelectItem value="STUDENT">Student</SelectItem></SelectContent>
            </Select>
            <Select value={filters.status ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, status: v === "all" ? undefined : v }))}>
              <SelectTrigger className="w-[130px] border-0 bg-card shadow-sm h-10"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="disabled">Disabled</SelectItem></SelectContent>
            </Select>
          </div>
        }
      />

      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">Edit User</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Display Name</Label><Input value={editForm.displayName} onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Email</Label><Input value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm((f) => ({ ...f, role: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ADMIN">Admin</SelectItem><SelectItem value="STUDENT">Student</SelectItem></SelectContent></Select>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button><Button onClick={saveEdit} disabled={updateUser.isPending}>Save Changes</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmToggle}
        onOpenChange={(open) => !open && setConfirmToggle(null)}
        title={confirmToggle?.isActive ? "Disable User" : "Enable User"}
        description={`Are you sure you want to ${confirmToggle?.isActive ? "disable" : "enable"} ${confirmToggle?.displayName}?`}
        onConfirm={handleToggle}
        variant={confirmToggle?.isActive ? "danger" : "warning"}
        confirmText={confirmToggle?.isActive ? "Disable" : "Enable"}
      />
    </div>
  );
}
