"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { Spin } from "antd";

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
      <Spin size="large" />
    </div>
  );
}
