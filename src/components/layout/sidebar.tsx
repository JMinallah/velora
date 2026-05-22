import { Bell, Home, LineChart, Package2, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Sidebar() {
  return (
    <div className="hidden border-r bg-sidebar md:block">
      <div className="flex h-full max-h-screen flex-col gap-2">
        <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Package2 className="h-6 w-6 text-primary" />
            <span className="">Velora</span>
          </Link>
          <Button variant="outline" size="icon" className="ml-auto h-8 w-8">
            <Bell className="h-4 w-4" />
            <span className="sr-only">Toggle notifications</span>
          </Button>
        </div>
        <div className="flex-1">
          <nav className="grid items-start px-2 text-sm font-medium lg:px-4">
            <Link
              href="#"
              className="flex items-center gap-3 rounded-lg bg-sidebar-accent px-3 py-2 text-sidebar-accent-foreground transition-all hover:text-primary"
            >
              <Home className="h-4 w-4" />
              Dashboard
            </Link>
            <Link
              href="#"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-all hover:text-primary"
            >
              <LineChart className="h-4 w-4" />
              Timeline
            </Link>
            <Link
              href="/documents"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-all hover:text-primary"
            >
              <Users className="h-4 w-4" />
              Documents
            </Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
