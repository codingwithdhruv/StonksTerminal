'use client';

import { motion, AnimatePresence } from "framer-motion";
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
} from "lucide-react";

import { cn } from "@/lib/utils";

const navigation = [
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "Technology", href: "/category/technology", icon: Microscope },
  { name: "Healthcare", href: "/category/healthcare", icon: Stethoscope },
  { name: "Crypto", href: "/category/crypto", icon: Bitcoin },
  { name: "Macro", href: "/category/macro", icon: Globe },
  { name: "Earnings", href: "/category/earnings", icon: TrendingUp },
  { name: "FDA Catalysts", href: "/category/fda", icon: Zap },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navContent = (
    <>
      <div className="flex h-16 items-center border-b border-white/5 px-6 justify-between">
        <div className="flex items-center gap-2.5 font-unbounded font-black tracking-tighter text-primary">
          <Zap className="h-5 w-5 fill-primary/20" />
          <span className="text-sm uppercase tracking-widest">Stonks</span>
        </div>
        {/* Close button for mobile */}
        <button
          className="lg:hidden p-2 rounded-full hover:bg-white/5 transition-colors"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      
      <div className="flex-1 overflow-auto py-6 px-3">
        <nav className="grid gap-1">
          {navigation.map((item, i) => {
            const isActive = pathname === item.href;
            return (
              <motion.div
                key={item.name}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold transition-all duration-300 relative overflow-hidden",
                    isActive
                      ? "text-primary bg-primary/10 shadow-[0_0_20px_rgba(112,255,155,0.05)]"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-nav"
                      className="absolute left-0 w-1 h-1/2 bg-primary rounded-r-full"
                    />
                  )}
                  <item.icon className={cn(
                    "h-4 w-4 transition-transform duration-300 group-hover:scale-110", 
                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                  )} />
                  <span className="tracking-wide">{item.name}</span>
                </Link>
              </motion.div>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto border-t border-white/5 p-6">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
          <div className="relative">
            <Activity className="h-3.5 w-3.5 text-emerald-500" />
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 bg-emerald-500 rounded-full animate-ping" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/80">Markets Live</span>
        </div>
      </div>
    </>
  );

  return (
    <>
      <div className="noise-overlay" />
      {/* Mobile hamburger */}
      <button
        className="fixed top-4 left-4 z-50 lg:hidden p-2.5 rounded-xl glass-panel shadow-2xl border-white/10"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-md lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-64 flex-col glass-panel border-r border-white/5 transition-transform duration-500 ease-out lg:relative lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {navContent}
      </div>
    </>
  );
}
