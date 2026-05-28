"use client";

import { Home, LineChart, Package2, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type MouseEvent } from "react";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

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
    router.push(href);
  };

  const isDashboardActive = pathname === "/";
  const isTimelineActive = pathname.startsWith("/mission");
  const isDocumentsActive = pathname.startsWith("/documents");

  return (
    <div className="sticky top-0 z-30 hidden h-screen bg-sidebar shadow-sm md:block">
      <div className="flex h-full max-h-screen flex-col gap-2">
        <div className="flex h-14 items-center px-4 lg:h-15 lg:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Package2 className="h-6 w-6 text-primary" />
            <span className="">Velora</span>
          </Link>
        </div>
        <div className="flex-1 pt-6">
          <nav className="grid items-start px-2 text-sm font-medium lg:px-4">
            <Link
              href="/"
              onClick={(event) => handleNavClick(event, "/")}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary ${
                isDashboardActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground"
              }`}
            >
              <Home
                className={`h-4 w-4 ${
                  isDashboardActive ? "text-primary" : "text-sidebar-foreground"
                }`}
              />
              Dashboard
            </Link>
            <Link
              href="/mission/1"
              onClick={(event) => handleNavClick(event, "/mission/1")}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary ${
                isTimelineActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground"
              }`}
            >
              <LineChart
                className={`h-4 w-4 ${
                  isTimelineActive ? "text-primary" : "text-sidebar-foreground"
                }`}
              />
              Timeline
            </Link>
            <Link
              href="/documents"
              onClick={(event) => handleNavClick(event, "/documents")}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary ${
                isDocumentsActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground"
              }`}
            >
              <Users
                className={`h-4 w-4 ${
                  isDocumentsActive ? "text-primary" : "text-sidebar-foreground"
                }`}
              />
              Documents
            </Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
