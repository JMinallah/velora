import { redirect } from "next/navigation"
import { auth, signIn } from "@/lib/auth"
import { env } from "@/lib/env"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

// Reads env + session at request time; never prerendered at build.
export const dynamic = "force-dynamic"

export default async function SignInPage() {
  const session = await auth()
  if (session?.user) redirect("/")

  const magicLinkEnabled = Boolean(env().AUTH_RESEND_KEY)

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to Velora</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form
            action={async () => {
              "use server"
              await signIn("google", { redirectTo: "/" })
            }}
          >
            <Button type="submit" className="w-full">
              Continue with Google
            </Button>
          </form>
          {magicLinkEnabled && (
            <form
              action={async (formData: FormData) => {
                "use server"
                await signIn("resend", {
                  email: formData.get("email"),
                  redirectTo: "/",
                })
              }}
              className="flex flex-col gap-2"
            >
              <Input type="email" name="email" placeholder="you@example.com" required />
              <Button type="submit" variant="outline" className="w-full">
                Email me a sign-in link
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
