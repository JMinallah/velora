import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Resend from "next-auth/providers/resend"
import { MongoDBAdapter } from "@auth/mongodb-adapter"
import type { Provider } from "next-auth/providers"
import { getClient } from "@/adapters/db"
import { env } from "@/lib/env"

// Managed auth per docs/04-SECURITY.md §2.1: Google OAuth always; email
// magic links only when a Resend key is configured. No local passwords.
function providers(): Provider[] {
  const list: Provider[] = [
    Google({
      clientId: env().AUTH_GOOGLE_ID,
      clientSecret: env().AUTH_GOOGLE_SECRET,
    }),
  ]
  if (env().AUTH_RESEND_KEY) {
    list.push(
      Resend({
        apiKey: env().AUTH_RESEND_KEY,
        from: env().EMAIL_FROM ?? "Velora <onboarding@resend.dev>",
      })
    )
  }
  return list
}

// Lazy config: env access and the DB connection happen on first request,
// never at module import — `next build` must succeed with no secrets present.
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  // databaseName is required: without it the adapter uses the database named
  // in the connection string ("test" when none), splitting users/sessions
  // away from the app data in MONGODB_DB.
  adapter: MongoDBAdapter(getClient(), { databaseName: env().MONGODB_DB }),
  providers: providers(),
  secret: env().AUTH_SECRET,
  session: { strategy: "database" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id
      return session
    },
  },
  pages: {
    signIn: "/signin",
  },
}))
