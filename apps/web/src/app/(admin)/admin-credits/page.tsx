"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/admin/data-table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useAdminCredits,
  useAdminUserTransactions,
  useGrantCredits,
  useDeductCredits,
} from "@/features/admin/hooks";
import { toast } from "sonner";
import { Plus, Minus, History } from "lucide-react";
import dayjs from "dayjs";

interface CreditUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  balance: number;
}

interface Transaction {
  id: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
}

const REASON_LABELS: Record<string, string> = {
  SIGNUP_BONUS: "Signup Bonus",
  DAILY_BONUS: "Daily Bonus",
  PRONUNCIATION_SESSION: "Pronunciation",
  POLLY_TTS: "TTS Audio",
  AI_GRADING: "AI Grading",
  ADMIN_TOPUP: "Admin Grant",
  ADMIN_DEDUCT: "Admin Deduct",
};

export default function AdminCreditsPage() {
  const [search, setSearch] = useState("");
  const { data: creditsData, isLoading } = useAdminCredits({
    search: search || undefined,
  });
  const users: CreditUser[] = creditsData?.data ?? [];

  const grantCredits = useGrantCredits();
  const deductCredits = useDeductCredits();

  // Credit action dialog
  const [actionUser, setActionUser] = useState<CreditUser | null>(null);
  const [actionType, setActionType] = useState<"grant" | "deduct">("grant");
  const [amount, setAmount] = useState("");

  // Transaction history sheet
  const [historyUser, setHistoryUser] = useState<CreditUser | null>(null);
  const { data: transactions = [] } = useAdminUserTransactions(
    historyUser?.id ?? null
  );

  function openAction(user: CreditUser, type: "grant" | "deduct") {
    setActionUser(user);
    setActionType(type);
    setAmount("");
  }

  function handleAction() {
    if (!actionUser || !amount) return;
    const num = parseInt(amount, 10);
    if (isNaN(num) || num <= 0) {
      toast.error("Enter a valid positive number");
      return;
    }

    const mutation = actionType === "grant" ? grantCredits : deductCredits;
    mutation.mutate(
      { userId: actionUser.id, amount: num },
      {
        onSuccess: () => {
          toast.success(
            `${actionType === "grant" ? "Granted" : "Deducted"} ${num} credits`
          );
          setActionUser(null);
        },
        onError: (err: any) => {
          toast.error(
            err.response?.data?.message || "Failed to update credits"
          );
        },
      }
    );
  }

  const columns: ColumnDef<CreditUser, unknown>[] = [
    {
      accessorKey: "displayName",
      header: "User",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 ring-2 ring-primary/10">
            <AvatarImage src={row.original.avatarUrl ?? undefined} />
            <AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-semibold">
              {(row.original.displayName ?? "??").slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-semibold">
              {row.original.displayName ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {row.original.email}
            </p>
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
          <Badge
            className={
              role === "ADMIN"
                ? "bg-indigo-100 text-indigo-800"
                : "bg-teal-100 text-teal-800"
            }
          >
            {role}
          </Badge>
        );
      },
    },
    {
      accessorKey: "balance",
      header: "Credits",
      cell: ({ getValue }) => {
        const bal = getValue() as number;
        return (
          <span className="text-lg font-black tabular-nums">{bal}</span>
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => openAction(row.original, "grant")}
            title="Grant credits"
          >
            <Plus className="h-4 w-4 text-green-600" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => openAction(row.original, "deduct")}
            title="Deduct credits"
          >
            <Minus className="h-4 w-4 text-red-600" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setHistoryUser(row.original)}
            title="View history"
          >
            <History className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Credit Management"
        description="View and manage user credit balances"
      />

      {/* Search */}
      <div className="mb-4">
        <Input
          placeholder="Search by name or email..."
          className="max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <DataTable columns={columns} data={users} isLoading={isLoading} />

      {/* Grant/Deduct Dialog */}
      <Dialog
        open={!!actionUser}
        onOpenChange={(open) => !open && setActionUser(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "grant" ? "Grant" : "Deduct"} Credits
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              User:{" "}
              <strong>
                {actionUser?.displayName ?? actionUser?.email}
              </strong>
            </p>
            <p className="text-sm text-muted-foreground">
              Current balance: <strong>{actionUser?.balance}</strong>
            </p>
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter credit amount"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionUser(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleAction}
              disabled={
                !amount ||
                grantCredits.isPending ||
                deductCredits.isPending
              }
              variant={actionType === "deduct" ? "destructive" : "default"}
            >
              {actionType === "grant" ? "Grant" : "Deduct"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction History Sheet */}
      <Sheet
        open={!!historyUser}
        onOpenChange={(open) => !open && setHistoryUser(null)}
      >
        <SheetContent className="w-[420px] sm:w-[480px]">
          <SheetHeader>
            <SheetTitle>
              Credit History —{" "}
              {historyUser?.displayName ?? historyUser?.email}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2 max-h-[calc(100vh-120px)] overflow-y-auto">
            {(transactions as Transaction[]).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No transactions yet
              </p>
            )}
            {(transactions as Transaction[]).map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between border rounded-lg px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">
                    {REASON_LABELS[tx.reason] ?? tx.reason}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {dayjs(tx.createdAt).format("MMM D, YYYY h:mm A")}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`text-sm font-bold ${
                      tx.amount > 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {tx.amount > 0 ? "+" : ""}
                    {tx.amount}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    bal: {tx.balanceAfter}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
