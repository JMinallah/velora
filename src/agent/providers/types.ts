/** Provider-agnostic LLM contract (docs/02-ARCHITECTURE.md §3.1 adapters). */

export type ProviderToolCall = { name: string; args: unknown }

export type AgentTurn =
  | { role: "user"; text: string }
  | { role: "assistant"; text?: string; toolCalls?: ProviderToolCall[] }
  | { role: "tool"; name: string; result: unknown }

export type ToolDeclaration = {
  name: string
  description: string
  /** JSON-schema object for the tool's input. */
  parameters: Record<string, unknown>
}

export type ProviderResponse = {
  text: string
  toolCalls: ProviderToolCall[]
}

export interface LlmProvider {
  generate(input: {
    system: string
    turns: AgentTurn[]
    tools: ToolDeclaration[]
  }): Promise<ProviderResponse>
}
