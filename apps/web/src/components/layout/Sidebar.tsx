"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Upload,
  Search,
  FolderOpen,
  Video,
  MessageSquare,
  Scissors,
  Settings,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/search", label: "Search", icon: Search },
  { href: "/dashboard/files", label: "Files", icon: FolderOpen },
  { href: "/dashboard/videos", label: "Videos", icon: Video },
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquare },
  { href: "/dashboard/clips", label: "Clips", icon: Scissors },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hairline-r sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-background lg:flex">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 pb-6 pt-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-7 w-7 place-items-center bg-lime-300 font-display text-xs font-bold text-black">Æ</span>
          <span className="font-display text-sm font-bold tracking-[0.22em]">AETHER</span>
        </Link>
      </div>
      <div className="mono-label px-5 pb-3">CONSOLE</div>

      {/* Nav */}
      <nav className="flex-1 space-y-px overflow-y-auto px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 px-3.5 py-2.5 text-sm transition-all",
                isActive
                  ? "bg-white/[0.05] font-medium text-foreground"
                  : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
              )}
            >
              {/* Active marker: lime bar */}
              <span
                className={cn(
                  "absolute left-0 top-1/2 h-[60%] w-[2px] -translate-y-1/2 transition-all",
                  isActive ? "bg-lime-300" : "bg-transparent group-hover:bg-white/20"
                )}
              />
              <Icon
                className={cn(
                  "h-4 w-4",
                  isActive ? "lime-text" : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              <span>{item.label}</span>
              {isActive && (
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">●</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer status */}
      <div className="p-4">
        <div className="panel p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="live-dot" />
            <span className="mono-label">Engine online</span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Uploads become searchable in under a minute.
          </p>
        </div>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="ml-auto flex items-center gap-1 overflow-x-auto">
      {navItems.slice(0, 6).map((item) => {
        const Icon = item.icon;
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "p-2 transition",
              isActive ? "bg-white/[0.07] lime-text" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
            )}
            aria-label={item.label}
          >
            <Icon className="h-[18px] w-[18px]" />
          </Link>
        );
      })}
    </nav>
  );
}
