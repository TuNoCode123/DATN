"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spin } from "antd";

export default function AdminNotFound() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin-dashboard");
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Spin size="large" />
    </div>
  );
}
