
import { GoogleAuth } from 'google-auth-library';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

const PROJECT = process.env.AGENT_PROJECT_NUMBER!;
const LOCATION = process.env.AGENT_LOCATION!;
const RESOURCE_ID = process.env.AGENT_RESOURCE_ID!;

async function test() {
  console.log('Testing Agent Integration...');
  console.log(`Project: ${PROJECT}`);
  console.log(`Location: ${LOCATION}`);
  console.log(`Resource ID: ${RESOURCE_ID}`);

  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  try {
    const client = await auth.getClient();
    const { token } = await client.getAccessToken();
    console.log('Successfully obtained access token.');

    // 1. Create Session
    console.log('\n1. Creating Session...');
    const sessionUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${PROJECT}/locations/${LOCATION}/reasoningEngines/${RESOURCE_ID}/sessions`;
    const sessionRes = await fetch(sessionUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: 'test-user' }),
    });

    if (!sessionRes.ok) {
      const err = await sessionRes.text();
      console.error('Session creation failed:', err);
      return;
    }

    const sessionData = await sessionRes.json() as any;
    const sessionId = sessionData.response.name.split('/').pop();
    console.log(`Session created: ${sessionId}`);

    // 2. Stream Query
    console.log('\n2. Sending Query...');
    const queryUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}/reasoningEngines/${RESOURCE_ID}:streamQuery`;
    const queryRes = await fetch(queryUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { message: 'Hello, who are you?', session_id: sessionId, user_id: 'test-user' },
      }),
    });

    if (!queryRes.ok) {
      const err = await queryRes.text();
      console.error('Query failed:', err);
      return;
    }

    const raw = await queryRes.text();
    const lines = raw.trim().split('\n').filter(Boolean);
    const events = lines.map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean);
    const textEvent = events.find(e => e?.content?.parts?.[0]?.text);
    const reply = textEvent?.content?.parts?.[0]?.text ?? 'No response';

    console.log(`Agent reply: ${reply}`);
    console.log('\nIntegration test successful! 🎉');
  } catch (error) {
    console.error('Integration test failed:', error);
  }
}

test();
