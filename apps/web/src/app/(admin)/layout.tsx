"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/admin/sidebar";
import { Topbar } from "@/components/admin/topbar";
import { useAuthStore } from "@/lib/auth-store";
import { Toaster } from "sonner";
import { Spin } from "antd";
import { AntdProvider } from "@/lib/antd-provider";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isReady } = useAuthStore();

  useEffect(() => {
    // Wait for the global session restore (SessionRestore) to resolve —
    // Firebase's session restore is async, so checking `user` before
    // `isReady` flips true would redirect logged-in admins to /login on
    // every hard refresh / direct navigation (race condition).
    if (!isReady) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    if (user.role !== "ADMIN") {
      router.replace("/");
    }
  }, [isReady, user, router]);

  if (!isReady || !user || user.role !== "ADMIN") {
    return (
      <AntdProvider>
        <div className="flex h-screen items-center justify-center bg-background">
          <Spin size="large" />
        </div>
      </AntdProvider>
    );
  }

  return (
    <AntdProvider>
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
    </AntdProvider>
  );
}
