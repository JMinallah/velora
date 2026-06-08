"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NotificationBell } from "./NotificationBell";
import { Home, LineChart, Menu, Package2, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type MouseEvent } from "react";

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [timelineHref, setTimelineHref] = useState("/onboarding");

  useEffect(() => {
    let cancelled = false;

    async function loadMissionHref() {
      try {
        const response = await fetch("/api/missions");
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data?.success) {
          return;
        }

        const latestMissionId = data.data?.[0]?.id;
        if (!cancelled && latestMissionId) {
          setTimelineHref(`/mission/${latestMissionId}`);
        }
      } catch {
        if (!cancelled) {
          setTimelineHref("/onboarding");
        }
      }
    }

    loadMissionHref();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleNavClick = (
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    setOpen(false);
    router.push(href);
  };

  const isDashboardActive = pathname === "/";
  const isTimelineActive = pathname?.startsWith("/mission") ?? false;
  const isDocumentsActive = pathname?.startsWith("/documents") ?? false;

  const mobileNavItems = [
    {
      href: "/",
      label: "Dashboard",
      icon: Home,
      active: isDashboardActive,
    },
    {
      href: timelineHref,
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
    <header className="sticky top-0 flex h-14 items-center gap-4 bg-sidebar/95 px-4 shadow-sm supports-backdrop-filter:backdrop-blur lg:h-15 lg:px-6">
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
              <SheetDescription className="sr-only">
                Navigate between dashboard, timeline, and documents.
              </SheetDescription>
            </SheetHeader>
            <nav className="grid gap-2 text-lg font-medium">
              <Link
                href="/"
                onClick={(event) => handleNavClick(event, "/")}
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
                    onClick={(event) => handleNavClick(event, item.href)}
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
