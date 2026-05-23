"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NotificationBell } from "./NotificationBell";
import { Home, LineChart, Menu, Package2, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isDashboardActive = pathname === "/";
  const isTimelineActive = pathname.startsWith("/mission");
  const isDocumentsActive = pathname.startsWith("/documents");

  const mobileNavItems = [
    {
      href: "/",
      label: "Dashboard",
      icon: Home,
      active: isDashboardActive,
    },
    {
      href: "/mission/1",
      label: "Timeline",
      icon: LineChart,
      active: isTimelineActive,
    },
    {
      href: "/documents",
      label: "Documents",
      icon: Users,
      active: isDocumentsActive,
    },
  ];

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background px-4 lg:h-15 lg:px-6">
      <Link href="/" className="flex items-center gap-2 font-semibold md:hidden">
        <Package2 className="h-6 w-6 text-primary" />
        <span>Velora</span>
      </Link>

      <div className="ml-auto flex items-center gap-1">
        <NotificationBell />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent side="left" className="flex flex-col">
            <SheetHeader>
              <SheetTitle className="sr-only">Navigation menu</SheetTitle>
            </SheetHeader>
            <nav className="grid gap-2 text-lg font-medium">
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 text-lg font-semibold"
              >
                <Package2 className="h-6 w-6 text-primary" />
                <span>Velora</span>
              </Link>
                {mobileNavItems.map((item, index) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                      className={`mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 hover:text-foreground ${
                        index === 0 ? "mt-3" : ""
                      } ${
                      item.active
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 ${
                        item.active ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
