import { NextRequest, NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';

const PROJECT = process.env.AGENT_PROJECT_NUMBER!;
const LOCATION = process.env.AGENT_LOCATION!;
const RESOURCE_ID = process.env.AGENT_RESOURCE_ID!;

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

export async function POST(req: NextRequest) {
  const { message, sessionId, userId } = await req.json();

  const client = await auth.getClient();
  const { token } = await client.getAccessToken();

  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}/reasoningEngines/${RESOURCE_ID}:streamQuery`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: { message, session_id: sessionId, user_id: userId },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Agent error:', err);
    return NextResponse.json({ error: 'Agent call failed' }, { status: 500 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = res.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const event = JSON.parse(trimmed);
              const text = event?.content?.parts?.[0]?.text;
              if (text) {
                controller.enqueue(new TextEncoder().encode(text));
              }
            } catch (e) {
              console.error('Error parsing stream line:', e);
            }
          }
        }
      } catch (err) {
        console.error('Stream reading error:', err);
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
