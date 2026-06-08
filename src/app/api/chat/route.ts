import { NextRequest, NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';

const PROJECT_ID = 'velora-497511';
const LOCATION = process.env.AGENT_LOCATION || 'us-west1';
const RESOURCE_ID = process.env.AGENT_RESOURCE_ID || '7640576670159601664';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, history = [], context = "", sessionId = "default-session" } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    }

    const prompt = [context.trim(), message.trim()].filter(Boolean).join("\n\n") || message;

    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    
    const client = await auth.getClient();
    const { token } = await client.getAccessToken();

    const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/reasoningEngines/${RESOURCE_ID}:query`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          message: prompt,
          session_id: sessionId,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Agent error:', err);
      return NextResponse.json({ error: 'Agent call failed: ' + err }, { status: 500 });
    }

    const data = await res.json();
    
    // The response format from Reasoning Engine can vary. 
    // Usually it's in data.output or data.output.output or similar.
    let replyText = "";
    if (typeof data.output === 'string') {
      replyText = data.output;
    } else if (data.output && typeof data.output.output === 'string') {
      replyText = data.output.output;
    } else if (data.output && typeof data.output.text === 'string') {
      replyText = data.output.text;
    } else {
      replyText = JSON.stringify(data.output ?? data);
    }

    return NextResponse.json({ 
      success: true,
      response: replyText 
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Vertex AI API Error:", errorMessage);
    return NextResponse.json(
      { error: errorMessage || "Failed to get response from Agent" },
      { status: 500 }
    );
  }
}
