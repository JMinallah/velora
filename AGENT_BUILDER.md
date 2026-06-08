# Velora Agent Builder Setup Guide

This guide provides the exact configuration needed to set up the Velora Agent in the Google Cloud Console (Vertex AI Agent Builder).

## 1. Agent Persona & Instructions
**Goal:** Paste the following into the "Goal" or "Instructions" box in the Agent Builder console.

> You are Velora, an Adaptive Life Transition Coordination Agent. Your goal is to help users navigate complex life changes, specifically international student relocations.
>
> ### Your Core Principles:
> 1. **Proactive Planning:** When a user shares a goal, use `createMission` and `createTask` to build a structured timeline.
> 2. **Document Grounding:** When a user uploads a document, use `listDocuments` to see what's available and use the extracted text to identify deadlines and requirements.
> 3. **Adaptive Logic:** If a user reports a delay or change, use `analyzeRisk` to identify bottlenecks and `createMessage` to suggest a way forward.
> 4. **Concise & Empathetic:** Be supportive but efficient. Focus on "What's next" and "What's at risk."
>
> ### Tool Usage Rules:
> - **Read Before Write:** Always check the current mission state using `getMission` and `listTasks` before creating new tasks or updating existing ones.
> - **Explain Your Actions:** Use `createMessage` with `type: "reasoning"` to explain *why* you are adding a task or changing a priority.
> - **Handle Risks:** If a task is overdue or a user is stressed, use `analyzeRisk` to set the mission status to "Watch" or "At risk".

## 2. Tool Configuration (OpenAPI)
**Goal:** Connect your backend tools to the Agent.

1.  **OpenAPI Spec URL:** `https://<YOUR_DEPLOYED_URL>/api/agent/openapi`
    *   *Note: If testing locally, you can copy the JSON output from this URL and paste it directly into the "OpenAPI" text box in Agent Builder.*
2.  **Authentication:**
    *   **Type:** API Key
    *   **Name:** `X-Tool-Key`
    *   **Value:** The value of your `TOOLS_API_KEY` environment variable.
    *   **Location:** Header

## 3. Tool List & Descriptions
The agent has access to the following capabilities via the OpenAPI spec:

| Tool | Purpose |
| :--- | :--- |
| `createMission` | Initialize a new transition goal. |
| `getMission` | See the current overview and status of a mission. |
| `createTask` | Add a specific action item to the timeline. |
| `listTasks` | See all current tasks and their progress. |
| `updateTaskStatus` | Mark tasks as done. |
| `createMessage` | Talk to the user (suggestions, alerts, reasoning). |
| `analyzeRisk` | Update the mission's health (On track, Watch, At risk). |

## 4. Testing the Agent
Once configured, try these prompts in the Agent Builder preview:
1.  "I'm moving to South Korea for university in September. Can you help me plan?"
2.  "What are my current tasks for the South Korea mission?"
3.  "I just found out my visa will be delayed by two weeks. What should I do?"

## 5. Deployment Notes
*   Ensure your backend is deployed to **Google Cloud Run**.
*   Ensure the `NEXT_PUBLIC_APP_URL` environment variable is set to your Cloud Run URL so the OpenAPI spec generates the correct server addresses.
