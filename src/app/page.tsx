"use client"

import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { v4 as uuidv4 } from "uuid"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Camera, File, Send } from "lucide-react"
import { sendGeminiChat } from "@/lib/gemini-chat"
import type { Message } from "@/types"

const PLACEHOLDERS = [
  "Ask anything...",
  "Generate ideas...",
  "Upload a file to analyze...",
  "Create something amazing...",
]

export default function Dashboard() {
  const [draft, setDraft] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [placeholder, setPlaceholder] = useState(PLACEHOLDERS[0])
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId] = useState(() => uuidv4())
  const idx = useRef(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const messageListRef = useRef<HTMLDivElement | null>(null)
  const assistantAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const t = setInterval(() => {
      idx.current = (idx.current + 1) % PLACEHOLDERS.length
      setPlaceholder(PLACEHOLDERS[idx.current])
    }, 3500)

    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const el = messageListRef.current
    if (!el) return

    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [messages])

  function handleFiles(selected: FileList | null) {
    if (!selected) return
    setFiles((prev) => [...prev, ...Array.from(selected)])
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((file) => file.name !== name))
  }

  async function handleSend() {
    const text = draft.trim()
    const messageText = text || (files.length > 0 ? `Uploaded ${files.length} file${files.length === 1 ? "" : "s"}` : "")
    if (!messageText) return

    const userMessage: Message = {
      id: `u-${Date.now()}`,
      type: "user",
      text: messageText,
      createdAt: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMessage])
    setDraft("")
    setFiles([])
    setIsLoading(true)

    // Cancel any previous request
    if (assistantAbortRef.current) {
      assistantAbortRef.current.abort()
    }

    assistantAbortRef.current = new AbortController()

    try {
      const assistantText = await sendGeminiChat(
        {
          message: messageText,
          sessionId,
          history: messages.map(m => ({ sender: m.type === 'user' ? 'user' : 'assistant', text: m.text })),
        },
        { signal: assistantAbortRef.current.signal }
      )

      const assistantMessage: Message = {
        id: `a-${Date.now()}`,
        type: "reasoning",
        text: assistantText,
        createdAt: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error: unknown) {
      let name: string | undefined
      if (typeof error === 'object' && error !== null && 'name' in error) {
        const maybeName = (error as Record<string, unknown>).name
        if (typeof maybeName === 'string') name = maybeName
      }
      if (name === 'AbortError') return

      console.error("Chat error:", error)

      const errorMessage: Message = {
        id: `a-${Date.now()}`,
        type: "alert",
        text: "Sorry, I encountered an error. Please try again.",
        createdAt: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <main className="flex h-[calc(100dvh-2rem)] min-h-0 flex-col items-center px-4 py-4 sm:py-6 lg:py-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.06),transparent_38%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.05),transparent_32%)]" />

      <div className="flex h-full min-h-0 w-full max-w-205 flex-col">
        <header className="shrink-0 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            V
          </div>
          <h1 className="text-3xl font-semibold">Welcome back 👋</h1>
          <p className="mt-2 text-sm text-muted-foreground">What would you like to do today?</p>
        </header>

        <section className="flex min-h-0 flex-1 flex-col pt-6">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div ref={messageListRef} className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center px-6 py-8 text-center text-sm text-muted-foreground">
                  Start a conversation. Messages will appear here.
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`mb-2 flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                          message.type === "user"
                            ? "bg-primary/10 text-foreground"
                            : "bg-muted/10 text-muted-foreground"
                        }`}
                      >
                        <div>{message.text}</div>
                        <div className="mt-1 text-xs opacity-70">{message.createdAt}</div>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="mb-2 flex justify-start">
                      <div className="rounded-xl bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
                        <div className="flex gap-1">
                          <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" />
                          <div className="animation-delay-200 h-2 w-2 animate-bounce rounded-full bg-muted-foreground" />
                          <div className="animation-delay-400 h-2 w-2 animate-bounce rounded-full bg-muted-foreground" />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="shrink-0 border-t border-border/10 p-3 sm:p-4">
              {files.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {files.map((file) => (
                    <div
                      key={file.name}
                      className="inline-flex items-center gap-2 rounded-full bg-muted/10 px-3 py-1 text-sm"
                    >
                      <span className="max-w-40 truncate">{file.name}</span>
                      <button onClick={() => removeFile(file.name)} className="text-muted-foreground">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="relative">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  className="min-h-23 max-h-[28vh] w-full resize-none rounded-[20px] border border-border/20 bg-transparent px-4 py-4 pr-16 text-base shadow-none focus:border-border/40 focus:ring-0"
                />

                <div className="absolute left-3 bottom-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-transparent text-muted-foreground transition hover:bg-muted/10"
                    aria-label="Upload file"
                  >
                    <File className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-transparent text-muted-foreground transition hover:bg-muted/10"
                    aria-label="Upload image"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                </div>

                <div className="absolute right-3 bottom-3">
                  <Button
                    onClick={handleSend}
                    disabled={isLoading}
                    className="h-9 w-9 rounded-full p-0"
                    aria-label="Send"
                  >
                    <Send className={`h-4 w-4 ${isLoading ? "animate-pulse" : ""}`} />
                  </Button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="shrink-0 pt-5 text-center">
          <div className="mx-auto flex max-w-md flex-wrap justify-center gap-3">
            {[
              "Generate UI ideas",
              "Summarize a document",
              "Help me write code",
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setDraft(prompt)}
                className="rounded-lg border border-border/20 px-4 py-2 text-sm transition hover:-translate-y-0.5 hover:shadow-sm"
              >
                {prompt}
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
