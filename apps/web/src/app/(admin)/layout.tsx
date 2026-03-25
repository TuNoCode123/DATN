"use client";

import { Sidebar } from "@/components/admin/sidebar";
import { Topbar } from "@/components/admin/topbar";
import { Toaster } from "sonner";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
