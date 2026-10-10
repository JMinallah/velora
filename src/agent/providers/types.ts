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

export interface LlmProvider {
  generate(input: {
    system: string
    turns: AgentTurn[]
    tools: ToolDeclaration[]
  }): Promise<ProviderResponse>
}
