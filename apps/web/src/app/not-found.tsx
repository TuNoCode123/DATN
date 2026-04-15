"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";

export default function NotFound() {
  const router = useRouter();
  const { user } = useAuthStore();

  useEffect(() => {
    if (user?.role === "ADMIN") {
      router.replace("/admin-dashboard");
    } else {
      router.replace("/");
    }
  }, [router, user]);

  return (
    <div className="flex h-screen items-center justify-center bg-cream">
      <div
        className="h-10 w-10 rounded-full border-[3px] border-slate-200 border-t-slate-700 animate-spin"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}
