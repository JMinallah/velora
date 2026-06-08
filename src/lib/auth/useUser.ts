"use client"

import { useState, useEffect } from "react"
import type { UserRecord } from "@/lib/mongodb/models"

export function useUser() {
  const [user, setUser] = useState<Omit<UserRecord, "passwordHash"> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadUser() {
      const token = localStorage.getItem("velora-token")
      if (!token) {
        setLoading(false)
        return
      }

      try {
        const res = await fetch("/api/auth/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        const json = await res.json()
        if (json.success) {
          setUser(json.data)
        } else {
          localStorage.removeItem("velora-token")
        }
      } catch (err) {
        console.error("Failed to fetch user", err)
      } finally {
        setLoading(false)
      }
    }

    loadUser()
  }, [])

  return { user, loading }
}
