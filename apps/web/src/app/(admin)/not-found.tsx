"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminNotFound() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin-dashboard");
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div
        className="h-10 w-10 rounded-full border-[3px] border-slate-200 border-t-slate-700 animate-spin"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}
