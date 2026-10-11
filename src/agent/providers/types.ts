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
}

export type GenerateInput = {
  system: string
  turns: AgentTurn[]
  tools: ToolDeclaration[]
  /** Aborted when the turn's time budget runs out; providers should stop the request. */
  signal?: AbortSignal
}

export interface LlmProvider {
  generate(input: GenerateInput): Promise<ProviderResponse>
  /**
   * Optional streaming variant (FR-AGT-1): resolves to the same complete
   * response, forwarding visible text to `onText` as it arrives.
   */
  generateStream?(input: GenerateInput & { onText: (delta: string) => void }): Promise<ProviderResponse>
}
