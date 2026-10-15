// A stand-in for the Gemini REST API, for end-to-end tests of the AI flows
// (delivery plan 7-6). The app reaches it through GEMINI_BASE_URL exactly as
// it reaches Google — same SDK, same requests, including streaming (SSE) —
// so these tests exercise everything except the model's judgement, which
// the eval suite covers against the real model.
//
// Answers are scripted from the conversation it is sent:
//   "add a task to <label> on <YYYY-MM-DD>"  → createTask, then a short reply
//   "delete the task <label>"                → listTasks, then deleteTask
//                                              (the app turns it into a
//                                              confirmation card), then a reply
//   a JSON request with a file attached      → a document extraction
//   a JSON request without one               → a mission plan
// Anything else gets a plain text reply. Unknown endpoints get 400, so a
// changed request shape fails loudly instead of passing by accident.
//
//   node e2e/fake-gemini.mjs [port]
import http from "node:http"

const port = Number(process.argv[2] ?? process.env.FAKE_GEMINI_PORT ?? 3102)

const usage = { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120 }
const reply = (parts) => ({ candidates: [{ content: { role: "model", parts }, finishReason: "STOP", index: 0 }], usageMetadata: usage })
const text = (t) => reply([{ text: t }])
const call = (name, args) => reply([{ functionCall: { name, args, id: `call-${Math.random().toString(36).slice(2, 10)}` } }])

function lastUserText(contents) {
  for (let i = contents.length - 1; i >= 0; i--) {
    const c = contents[i]
    if (c.role !== "user") continue
    const t = (c.parts ?? []).map((p) => p.text).filter(Boolean).join(" ")
    if (t) return t
  }
  return ""
}

/** Tool results returned since the user's last message, oldest first. */
function resultsSinceUser(contents) {
  const out = []
  for (let i = contents.length - 1; i >= 0; i--) {
    const parts = contents[i].parts ?? []
    if (contents[i].role === "user" && parts.some((p) => p.text)) break
    for (const p of parts) if (p.functionResponse) out.unshift(p.functionResponse)
  }
  return out
}

function chat(body) {
  const contents = body.contents ?? []
  const said = lastUserText(contents)
  const results = resultsSinceUser(contents)

  const add = /add a task to (.+?) on (\d{4}-\d{2}-\d{2})/i.exec(said)
  if (add) {
    if (results.length === 0) return call("createTask", { label: capitalize(add[1]), dueDate: add[2] })
    return text(`Done — "${capitalize(add[1])}" is on your list for ${add[2]}.`)
  }

  const del = /delete the task (.+?)\.?$/i.exec(said)
  if (del) {
    if (results.length === 0) return call("listTasks", {})
    if (results.length === 1) {
      const tasks = results[0].response?.result ?? []
      const task = tasks.find((t) => t.label.toLowerCase() === del[1].toLowerCase())
      if (!task) return text(`I couldn't find a task called "${del[1]}".`)
      return call("deleteTask", { taskId: task.id })
    }
    return text("I've asked you to confirm before anything is deleted.")
  }

  return text("I can help with that. Tell me what you'd like to change.")
}

function structured(body) {
  const hasFile = (body.contents ?? []).some((c) => (c.parts ?? []).some((p) => p.inlineData))
  if (hasFile) {
    return text(
      JSON.stringify({
        documentType: "passport",
        title: "Republic of Kenya Passport",
        summary: "A Kenyan passport for the account holder.",
        fields: [
          { label: "Passport No", value: "AK7654321" },
          { label: "Nationality", value: "Kenyan" },
        ],
        issueDate: "2022-03-02",
        expiryDate: "2032-03-02",
        containsInstructions: false,
      })
    )
  }
  const today = new Date()
  const day = (n) => new Date(today.getTime() + n * 86_400_000).toISOString().slice(0, 10)
  return text(
    JSON.stringify({
      title: "Move from Nairobi to Lisbon",
      summary: "Relocate to Lisbon for a new role, with residence and housing sorted before the start date.",
      targetDate: day(120),
      phases: [
        {
          name: "Paperwork",
          tasks: [
            { key: "visa-research", label: "Check the residence visa requirements on the official site", dueDate: day(7), priority: "high", dependsOn: [] },
            { key: "visa-apply", label: "Apply for the residence visa", dueDate: day(30), priority: "high", dependsOn: ["visa-research"] },
            { key: "documents", label: "Gather certified copies of documents", dueDate: day(20), priority: "medium", dependsOn: [] },
          ],
        },
        {
          name: "Housing",
          tasks: [
            { key: "neighbourhoods", label: "Shortlist neighbourhoods", dueDate: day(40), priority: "medium", dependsOn: [] },
            { key: "flat", label: "Rent a flat", dueDate: day(80), priority: "high", dependsOn: ["neighbourhoods"] },
            { key: "deposit", label: "Budget for the rental deposit", dueDate: day(60), priority: "medium", dependsOn: [] },
          ],
        },
        {
          name: "Moving",
          tasks: [
            { key: "flights", label: "Book flights", dueDate: day(90), priority: "medium", dependsOn: ["visa-apply"] },
            { key: "movers", label: "Book the movers", dueDate: day(95), priority: "low", dependsOn: ["flat"] },
          ],
        },
      ],
    })
  )
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200).end("ok")
    return
  }
  const match = /\/models\/[^:/]+:(generateContent|streamGenerateContent)/.exec(req.url ?? "")
  if (req.method !== "POST" || !match) {
    res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: { code: 400, message: `fake-gemini: unexpected ${req.method} ${req.url}` } }))
    return
  }
  let raw = ""
  req.on("data", (chunk) => (raw += chunk))
  req.on("end", () => {
    let body
    try {
      body = JSON.parse(raw)
    } catch {
      res.writeHead(400).end("bad json")
      return
    }
    const json = body.generationConfig?.responseMimeType === "application/json"
    const answer = json ? structured(body) : chat(body)

    if (match[1] === "generateContent") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(answer))
      return
    }
    // Streaming: text arrives in two chunks, as the real API sends deltas.
    res.writeHead(200, { "content-type": "text/event-stream" })
    const parts = answer.candidates[0].content.parts
    const chunks =
      parts.length === 1 && typeof parts[0].text === "string" && parts[0].text.length > 8
        ? [parts[0].text.slice(0, 8), parts[0].text.slice(8)].map((t, i) => ({ ...reply([{ text: t }]), ...(i === 0 ? { usageMetadata: undefined } : {}) }))
        : [answer]
    for (const chunk of chunks) res.write(`data: ${JSON.stringify(chunk)}\r\n\r\n`)
    res.end()
  })
})

server.listen(port, "127.0.0.1", () => console.log(`fake-gemini listening on http://127.0.0.1:${port}`))
