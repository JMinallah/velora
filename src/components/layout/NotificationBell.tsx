"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell, AlertTriangle, Info } from "lucide-react";
import { useEffect, useState } from "react";

type Notification = {
  id: string;
  type: "alert" | "info";
  text: string;
  read: boolean;
};

// initial empty; will be loaded from the reminders API
const mockNotifications: Notification[] = [];

const iconMap = {
    alert: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
    info: <Info className="h-4 w-4 text-blue-500" />,
};

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setIsLoading(true)
        setError(null)
        const res = await fetch(`/api/reminders`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load reminders")
        if (!cancelled) {
          const mapped: Notification[] = (data.data ?? []).map((r: { id: string, channel: string, title: string, read: boolean }) => ({ id: r.id, type: r.channel === "email" ? "alert" : "info", text: r.title, read: !!r.read }))
          setNotifications(mapped)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load reminders")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const unreadCount = notifications.filter((n) => !n.read).length

  async function markAllRead() {
    try {
      const ids = notifications.map((n) => n.id)
      if (ids.length === 0) return
      const res = await fetch(`/api/reminders`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "markRead", ids }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to mark read")
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark read")
    }
  }

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
            <Button variant="link" size="sm" className="text-xs" onClick={markAllRead}>Mark all as read</Button>
        </div>
        <div className="flex flex-col gap-3">
          {isLoading ? <div className="text-sm text-muted-foreground">Loading...</div> : null}
          {error ? <div className="text-sm text-red-600">{error}</div> : null}
          {notifications.map((notif) => (
            <div key={notif.id} className={`flex items-start gap-3 p-3 rounded-md ${!notif.read ? 'bg-secondary/50' : ''}`}>
              <div className="mt-1">{iconMap[notif.type]}</div>
              <p className="text-sm text-muted-foreground">{notif.text}</p>
            </div>
          ))}
          {notifications.length === 0 && !isLoading ? <div className="text-sm text-muted-foreground">No notifications</div> : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
