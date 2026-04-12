"use client";

import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/lib/auth-store";
import { Bell, LogOut, Settings, User, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const pageTitles: Record<string, { title: string; description: string }> = {
  "/admin-dashboard": { title: "Dashboard", description: "Platform overview and key metrics" },
  "/admin-users": { title: "User Management", description: "Manage students and administrators" },
  "/admin-questions": { title: "Question Bank", description: "Build your question library" },
  "/admin-tests": { title: "Test Management", description: "Create and publish assessments" },
  "/admin-results": { title: "Test Results", description: "Review student performance" },
  "/admin-comments": { title: "Comment Moderation", description: "Review reported and pending comments" },
  "/admin-analytics": { title: "Analytics", description: "Insights and learning trends" },
  "/admin-settings": { title: "Settings", description: "Account and platform preferences" },
};

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const displayName = user?.displayName || user?.email || "Admin";
  const avatarUrl = "";
  const page = pageTitles[pathname] ?? { title: "Admin", description: "" };

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <header className="flex items-center justify-between h-16 px-4 md:px-6 border-b bg-card/80 backdrop-blur-sm shrink-0 sticky top-0 z-30">
      {/* Left: Page title + subtitle */}
      <div className="flex flex-col pl-10 md:pl-0">
        <h1 className="font-heading text-lg font-semibold tracking-tight text-foreground">{page.title}</h1>
        <p className="text-xs text-muted-foreground hidden sm:block">{page.description}</p>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative h-9 w-9 cursor-pointer hover:bg-secondary">
          <Bell className="w-[18px] h-[18px] text-muted-foreground" />
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
            3
          </span>
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2 h-9 cursor-pointer hover:bg-secondary rounded-lg">
              <Avatar className="w-7 h-7 ring-2 ring-primary/20">
                <AvatarImage src={avatarUrl} alt={displayName} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium hidden sm:inline">{displayName}</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground hidden sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <div className="px-2 py-2 border-b">
              <p className="text-sm font-medium">{displayName}</p>
              <p className="text-xs text-muted-foreground">Administrator</p>
            </div>
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/admin-settings" className="flex items-center gap-2">
                <User className="w-4 h-4" /> Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/admin-settings" className="flex items-center gap-2">
                <Settings className="w-4 h-4" /> Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="flex items-center gap-2 text-destructive cursor-pointer focus:text-destructive">
              <LogOut className="w-4 h-4" /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
