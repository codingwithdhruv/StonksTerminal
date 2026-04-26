'use client';

import { useState } from 'react';
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Activity,
  Microscope,
  Stethoscope,
  Bitcoin,
  Globe,
  Menu,
  X,
  Zap,
  Flame,
} from "lucide-react";

import { cn } from "@/lib/utils";

const navigation = [
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "Technology", href: "/category/technology", icon: Microscope },
  { name: "Healthcare", href: "/category/healthcare", icon: Stethoscope },
  { name: "Crypto", href: "/category/crypto", icon: Bitcoin },
  { name: "Macro", href: "/category/macro", icon: Globe },
  { name: "Earnings", href: "/category/earnings", icon: TrendingUp },
  { name: "FDA Catalysts", href: "/category/fda", icon: Flame },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navContent = (
    <>
      <div className="flex h-12 sm:h-14 items-center border-b px-4 justify-between">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-400" />
          <span className="text-sm sm:text-base">StonksTerminal</span>
        </div>
        {/* Close button for mobile */}
        <button
          className="lg:hidden p-1 rounded hover:bg-muted"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-auto py-3 sm:py-4">
        <nav className="grid gap-0.5 sm:gap-1 px-2">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-2 sm:gap-3 rounded-md px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="mt-auto border-t p-3 sm:p-4">
        <div className="flex items-center gap-2 px-2 py-1 text-[10px] sm:text-xs text-muted-foreground">
          <Activity className="h-3 w-3 animate-pulse text-emerald-500" />
          <span>Markets Live</span>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed top-3 left-3 z-50 lg:hidden p-2 rounded-md bg-card border border-border shadow-lg"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — hidden on mobile, slide-in drawer */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-56 sm:w-60 flex-col border-r border-border bg-card/95 backdrop-blur transition-transform duration-200 lg:relative lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {navContent}
      </div>
    </>
  );
}
