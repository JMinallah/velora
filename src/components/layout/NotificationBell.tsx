"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell, AlertTriangle, Info } from "lucide-react";

type Notification = {
  id: string;
  type: "alert" | "info";
  text: string;
  read: boolean;
};

const mockNotifications: Notification[] = [
  {
    id: "notif-1",
    type: "alert",
    text: "Visa appointment deadline risk detected. Book within 3 days.",
    read: false,
  },
  {
    id: "notif-2",
    type: "info",
    text: "A new task 'Confirm flight details' has been added to your plan.",
    read: false,
  },
  {
    id: "notif-3",
    type: "info",
    text: "Your 'Submit Proof of Financial Sponsorship' task is due tomorrow.",
    read: true,
  },
];

const iconMap = {
    alert: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
    info: <Info className="h-4 w-4 text-blue-500" />,
};

export function NotificationBell() {
  const unreadCount = mockNotifications.filter((n) => !n.read).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full"
          aria-label="Open notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
          )}
          <span className="sr-only">Toggle notifications</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium text-sm">Notifications</h4>
            <Button variant="link" size="sm" className="text-xs">Mark all as read</Button>
        </div>
        <div className="flex flex-col gap-3">
            {mockNotifications.map(notif => (
                <div key={notif.id} className={`flex items-start gap-3 p-3 rounded-md ${!notif.read ? 'bg-secondary/50' : ''}`}>
                    <div className="mt-1">{iconMap[notif.type]}</div>
                    <p className="text-sm text-muted-foreground">{notif.text}</p>
                </div>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
