import { NextRequest, NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';

const PROJECT = process.env.AGENT_PROJECT_NUMBER!;
const LOCATION = process.env.AGENT_LOCATION!;
const RESOURCE_ID = process.env.AGENT_RESOURCE_ID!;

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

export async function POST(req: NextRequest) {
  const { userId } = await req.json();

  const client = await auth.getClient();
  const { token } = await client.getAccessToken();

  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${PROJECT}/locations/${LOCATION}/reasoningEngines/${RESOURCE_ID}/sessions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: userId }),
  });

  const data = await res.json();
  const sessionId = data.response.name.split('/').pop();
  return NextResponse.json({ sessionId });
}
