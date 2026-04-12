"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuthStore } from "@/lib/auth-store";
import {
  LayoutDashboard,
  Users,
  HelpCircle,
  ClipboardList,
  BarChart3,
  TrendingUp,
  Settings,
  ChevronLeft,
  ChevronRight,
  Menu,
  GraduationCap,
  Mic,
  CreditCard,
  Languages,
  Newspaper,
} from "lucide-react";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/admin-dashboard" },
  { icon: Users, label: "Users", href: "/admin-users" },
  { icon: ClipboardList, label: "Tests", href: "/admin-tests" },
  { icon: HelpCircle, label: "Question Bank", href: "/admin-questions" },
  { icon: Mic, label: "Pronunciation", href: "/admin-pronunciation-topics" },
  { icon: Languages, label: "Translation", href: "/admin-translation-topics" },
  { icon: Newspaper, label: "Blog", href: "/admin-blog" },
  { icon: BarChart3, label: "Results", href: "/admin-results" },
  { icon: CreditCard, label: "Credits", href: "/admin-credits" },
  { icon: TrendingUp, label: "Analytics", href: "/admin-analytics" },
  { icon: Settings, label: "Settings", href: "/admin-settings" },
];

function NavContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const displayName = user?.displayName || user?.email || "Admin";
  const avatarUrl = "";

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      {/* Logo — branded indigo header */}
      <div className={cn(
        "flex items-center gap-3 h-16 shrink-0 border-b border-sidebar-border",
        collapsed ? "justify-center px-2" : "px-5"
      )}>
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-sidebar-primary/20 ring-1 ring-sidebar-primary/30">
          <GraduationCap className="w-5 h-5 text-sidebar-primary" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="font-heading text-sm font-semibold text-white tracking-tight">IELTS AI</span>
            <span className="text-[10px] text-sidebar-foreground/60 font-medium uppercase tracking-wider">Admin Panel</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-4">
        <nav className="flex flex-col gap-1 px-3">
          {!collapsed && (
            <p className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40 px-3 mb-2">
              Navigation
            </p>
          )}
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium cursor-pointer",
                  "transition-all duration-200",
                  "hover:bg-sidebar-accent hover:text-white",
                  isActive
                    ? "bg-sidebar-primary text-white shadow-lg shadow-sidebar-primary/25"
                    : "text-sidebar-foreground/70",
                  collapsed && "justify-center px-2"
                )}
              >
                <item.icon className={cn(
                  "w-[18px] h-[18px] shrink-0 transition-transform duration-200",
                  "group-hover:scale-110",
                  isActive && "drop-shadow-sm"
                )} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* User section */}
      <div className={cn(
        "shrink-0 border-t border-sidebar-border",
        collapsed ? "p-2 flex justify-center" : "p-4"
      )}>
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <Avatar className="w-9 h-9 ring-2 ring-sidebar-primary/30">
            <AvatarImage src={avatarUrl} alt={displayName} />
            <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs font-semibold">
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-white truncate">{displayName}</span>
              <span className="text-[11px] text-sidebar-foreground/50">Administrator</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-sidebar-border relative shrink-0 overflow-hidden",
          "transition-all duration-300 ease-in-out",
          collapsed ? "w-[68px]" : "w-[260px]"
        )}
      >
        <NavContent collapsed={collapsed} />
        <Button
          variant="ghost"
          size="icon"
          className="absolute -right-0 top-[72px] z-10 h-6 w-6 rounded-l-md rounded-r-none bg-sidebar border border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </Button>
      </aside>

      {/* Mobile sidebar */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden fixed top-3 left-3 z-40 bg-card shadow-md border">
            <Menu className="w-5 h-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[260px] p-0 border-0">
          <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
          <NavContent collapsed={false} />
        </SheetContent>
      </Sheet>
    </>
  );
}
