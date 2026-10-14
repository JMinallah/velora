/** Provider-agnostic LLM contract (docs/02-ARCHITECTURE.md §3.1 adapters). */

/** `id` is set when the provider assigns one; the matching tool result must echo it back. */
export type ProviderToolCall = { name: string; args: unknown; id?: string }

export type AgentTurn =
  | { role: "user"; text: string }
  | {
      role: "assistant"
      text?: string
      toolCalls?: ProviderToolCall[]
      /** The provider's raw output for this turn, replayed verbatim (e.g. Gemini thought signatures). */
      providerParts?: unknown
    }
  | { role: "tool"; name: string; callId?: string; result: unknown }

export type ToolDeclaration = {
  name: string
  description: string
  /** JSON-schema object for the tool's input. */
  parameters: Record<string, unknown>
}

export type ProviderResponse = {
  text: string
  toolCalls: ProviderToolCall[]
  /** Opaque; the loop stores it on the assistant turn so the provider can replay it. */
  providerParts?: unknown
  /** Token counts, when the provider reports them (logged, NFR-OBS-1). */
  usage?: { inputTokens?: number; outputTokens?: number }
}

export type GenerateInput = {
  system: string
  turns: AgentTurn[]
  tools: ToolDeclaration[]
  /** Aborted when the turn's time budget runs out; providers should stop the request. */
  signal?: AbortSignal
}

export interface LlmProvider {
  /** The model answering, for logs and disclosure (e.g. "gemini-3.5-flash-lite"). */
  readonly model?: string
  generate(input: GenerateInput): Promise<ProviderResponse>
  /**
   * Optional streaming variant (FR-AGT-1): resolves to the same complete
   * response, forwarding visible text to `onText` as it arrives.
   */
  generateStream?(input: GenerateInput & { onText: (delta: string) => void }): Promise<ProviderResponse>
  /**
   * Optional: a single JSON answer constrained by `jsonSchema` (no tools), e.g.
   * a mission plan. Returns the raw text; callers must validate it.
   */
  generateStructured?(input: {
    system: string
    prompt: string
    jsonSchema: Record<string, unknown>
    /** Files the model reads alongside the prompt (e.g. an uploaded PDF or photo). */
    attachments?: { mimeType: string; data: Buffer }[]
    signal?: AbortSignal
  }): Promise<string>
}
