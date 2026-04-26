'use client';

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
  Settings,
} from "lucide-react";

import { cn } from "@/lib/utils";

const navigation = [
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "Technology", href: "/category/technology", icon: Microscope },
  { name: "Healthcare", href: "/category/healthcare", icon: Stethoscope },
  { name: "Crypto", href: "/category/crypto", icon: Bitcoin },
  { name: "Macro", href: "/category/macro", icon: Globe },
  { name: "Earnings", href: "/category/earnings", icon: TrendingUp },
  { name: "FDA Catalysts", href: "/category/fda", icon: Activity },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col border-r border-border bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center border-b px-4 py-4">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <Activity className="h-5 w-5 text-primary" />
          <span>StonksTerminal Pro</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto py-4">
        <nav className="grid gap-1 px-2">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="mt-auto border-t p-4">
        <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Settings className="h-4 w-4" />
          Settings
        </button>
      </div>
    </div>
  );
}
