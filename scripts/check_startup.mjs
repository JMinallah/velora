const required = [
  "MONGODB_URI",
  "JWT_SECRET",
  "GEMINI_API_KEY",
]

const missing = required.filter((name) => {
  const value = process.env[name]
  return typeof value !== "string" || value.trim().length === 0
})

const toolApiKey = process.env.TOOLS_API_KEY || process.env.TOOL_API_KEY || ""
if (toolApiKey.trim().length === 0) {
  missing.push("TOOLS_API_KEY or TOOL_API_KEY")
}

if (missing.length > 0) {
  console.error(`Missing required runtime environment variables: ${missing.join(", ")}`)
  process.exit(1)
}

console.log("Startup environment check passed")
