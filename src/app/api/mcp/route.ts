import { NextRequest, NextResponse } from "next/server"
import { createVeloraMcpServer } from "@/lib/mcp/velora"
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js"

// Simple in-memory transport for Next.js
class NextJSSETransport {
  onmessage?: (message: JSONRPCMessage) => Promise<void>
  onclose?: () => void
  onerror?: (error: Error) => void
  
  private controller: ReadableStreamDefaultController<Uint8Array>
  private encoder = new TextEncoder()
  
  constructor(controller: ReadableStreamDefaultController<Uint8Array>) {
    this.controller = controller
  }

  async start(): Promise<void> {
    // No-op for SSE
  }

  async send(message: JSONRPCMessage): Promise<void> {
    try {
      this.controller.enqueue(this.encoder.encode(`event: message\ndata: ${JSON.stringify(message)}\n\n`))
    } catch (e) {
      console.error("Error sending message to SSE:", e)
    }
  }

  async close(): Promise<void> {
    this.onclose?.()
  }
}

const activeTransports = new Map<string, NextJSSETransport>()
let lastActiveSessionId: string | null = null

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-tool-key, x-api-key, x-tools-api-key",
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function GET(req: NextRequest) {
  console.log("MCP GET request received")
  console.log(`GET Headers: ${JSON.stringify(Object.fromEntries(req.headers.entries()))}`)
  const sessionId = Math.random().toString(36).substring(7)
  lastActiveSessionId = sessionId
  
  const stream = new ReadableStream({
    async start(controller) {
      const transport = new NextJSSETransport(controller)
      activeTransports.set(sessionId, transport)
      
      // Send the endpoint event so the client knows where to POST
      const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host
      const protocol = req.headers.get("x-forwarded-proto") || "https"
      const absoluteUrl = `${protocol}://${host}${req.nextUrl.pathname}?sessionId=${sessionId}`
      
      console.log(`Connecting MCP session ${sessionId}, endpoint: ${absoluteUrl}`)
      
      const encoder = new TextEncoder()
      // Send the absolute URL as per spec, but some clients might prefer relative
      controller.enqueue(encoder.encode(`event: endpoint\ndata: ${absoluteUrl}\n\n`))

      // Keep-alive ping every 15 seconds
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"))
        } catch (e) {
          clearInterval(keepAlive)
        }
      }, 15000)

      try {
        // Create a new server instance for each session to avoid state sharing issues
        const server = createVeloraMcpServer()
        await server.connect(transport as unknown as Parameters<typeof server.connect>[0])
      } catch (e) {
        console.error("Error connecting server to transport:", e)
      }
      
      req.signal.addEventListener("abort", () => {
        console.log(`MCP session ${sessionId} aborted`)
        clearInterval(keepAlive)
        // Don't delete immediately, give POST requests time to finish
        setTimeout(() => {
          if (lastActiveSessionId === sessionId) lastActiveSessionId = null
          activeTransports.delete(sessionId)
          transport.close()
        }, 60000)
      })
    },
    cancel() {
      console.log(`MCP session ${sessionId} cancelled`)
      // Don't delete immediately
      setTimeout(() => {
        if (lastActiveSessionId === sessionId) lastActiveSessionId = null
        activeTransports.delete(sessionId)
      }, 60000)
    }
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform, no-store",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "Content-Encoding": "none",
      ...corsHeaders,
    },
  })
}

export async function POST(req: NextRequest) {
  let sessionId = req.nextUrl.searchParams.get("sessionId")
  
  if (!sessionId && activeTransports.size > 0) {
    sessionId = Array.from(activeTransports.keys())[0]
  } else if (!sessionId && lastActiveSessionId) {
    sessionId = lastActiveSessionId
  }

  console.log(`MCP POST request received for session ${sessionId || "GLOBAL"}`)
  
  const transport = sessionId ? activeTransports.get(sessionId) : null
  
  try {
    const body = await req.text()
    console.log(`Received body: ${body}`)
    const message = JSON.parse(body)

    // If it's an 'initialize' request, we return the result DIRECTLY in the POST response.
    // This is a common requirement for some MCP clients (like Vertex AI) to complete the handshake.
    if (message.method === "initialize") {
      console.log("Handling initialize request directly in POST response")
      const response = {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
            resources: {},
            prompts: {}
          },
          serverInfo: {
            name: "velora-mongodb",
            version: "1.0.0"
          }
        }
      }
      return new Response(JSON.stringify(response), { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      })
    }

    // Handle initialized notification
    if (message.method === "notifications/initialized") {
      return new Response("OK", { status: 200, headers: corsHeaders })
    }

    // If it's a 'tools/list' or 'tools/call' request and we don't have a session, 
    // handle it directly to be stateless-friendly for Vertex AI
    if ((message.method === "tools/list" || message.method === "tools/call") && (!transport || !transport.onmessage)) {
      console.log(`Handling ${message.method} request directly (stateless)`)
      
      const server = createVeloraMcpServer()
      let responsePayload: Record<string, unknown> | null = null
      
      let resolveInit: () => void = () => {}
      const initPromise = new Promise<void>((resolve) => { resolveInit = resolve })
      
      let resolveResponse: () => void = () => {}
      const responsePromise = new Promise<void>((resolve) => { resolveResponse = resolve })

      const tempTransport = {
        onmessage: undefined as ((message: JSONRPCMessage) => Promise<void>) | undefined,
        onclose: undefined as (() => void) | undefined,
        onerror: undefined as ((error: Error) => void) | undefined,
        start: async () => {},
        close: async () => {},
        send: async (msg: JSONRPCMessage) => {
          console.log(`Stateless transport received: ${JSON.stringify(msg)}`)
          if ("id" in msg && msg.id === "init-stateless") {
            resolveInit()
          } else if ("id" in msg && "id" in message && msg.id === message.id) {
            responsePayload = msg as Record<string, unknown>
            resolveResponse()
          }
        }
      }
      
      await server.connect(tempTransport as unknown as Parameters<typeof server.connect>[0])
      
      if (tempTransport.onmessage) {
        // 1. Initialize
        console.log("Stateless: Sending initialize")
        await tempTransport.onmessage({
          jsonrpc: "2.0",
          id: "init-stateless",
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "stateless-client", version: "1.0.0" }
          }
        } as JSONRPCMessage)
        
        // Wait for init response
        await Promise.race([initPromise, new Promise(r => setTimeout(r, 2000))])
        
        // 2. Initialized notification
        console.log("Stateless: Sending initialized notification")
        await tempTransport.onmessage({
          jsonrpc: "2.0",
          method: "notifications/initialized"
        } as JSONRPCMessage)
        
        // 3. The actual request
        console.log(`Stateless: Sending actual request ${message.method}`)
        await tempTransport.onmessage(message as JSONRPCMessage)
        
        // Wait up to 10 seconds for the response
        await Promise.race([responsePromise, new Promise(r => setTimeout(r, 10000))])
      }
      
      if (responsePayload) {
        console.log(`Stateless: Successfully got response for ${message.method}`)
        
        // Strip out annotations and execution from tools to avoid Vertex AI validation errors
        const payload = responsePayload as Record<string, unknown>;
        if (message.method === "tools/list" && payload.result && typeof payload.result === "object" && "tools" in payload.result && Array.isArray(payload.result.tools)) {
          payload.result.tools = payload.result.tools.map((tool: Record<string, unknown>) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { annotations, execution, ...rest } = tool;
            return rest;
          });
        }

        return new Response(JSON.stringify(payload), { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        })
      } else {
        console.error(`Stateless: Failed to get response for ${message.method} within timeout`)
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: "id" in message ? message.id : null,
          error: { code: -32603, message: "Internal error generating tools list" }
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
    }

    // For all other messages, use the transport if available
    if (transport && transport.onmessage) {
      await transport.onmessage(message)
      return new Response("Accepted", { status: 202, headers: corsHeaders })
    }
    
    if (!transport) {
      console.error(`MCP session ${sessionId} not found for method ${message.method}`)
      // Fallback: try to handle other discovery methods statelessly
      if (message.method === "resources/list" || message.method === "prompts/list") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: message.id,
          result: { [message.method.split('/')[0]]: [] }
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
      return new Response(`Session ${sessionId} not found`, { status: 404, headers: corsHeaders })
    }

    return new Response("Accepted", { status: 202, headers: corsHeaders })
  } catch (e) {
    console.error(`Error handling MCP POST:`, e)
    return new Response("Error", { status: 500, headers: corsHeaders })
  }
}
