"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/admin/sidebar";
import { Topbar } from "@/components/admin/topbar";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { Toaster } from "sonner";
import { Spin } from "antd";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkAdmin() {
      let currentUser = user;

      // If no user in store, try to restore session
      if (!currentUser) {
        try {
          const res = await api.get("/auth/cognito/me");
          currentUser = res.data;
          setUser(currentUser);
        } catch {
          // Not authenticated — redirect to login
          router.replace("/login");
          return;
        }
      }

      // Check admin role
      if (currentUser?.role !== "ADMIN") {
        router.replace("/");
        return;
      }

      setChecking(false);
    }

    checkAdmin();
  }, [user, router, setUser]);

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-muted/30">
          {children}
        </main>
      </div>
      <Toaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          className: "font-sans",
          style: { fontFamily: "var(--font-body), 'Open Sans', sans-serif" },
        }}
      />
    </div>
  );
}
