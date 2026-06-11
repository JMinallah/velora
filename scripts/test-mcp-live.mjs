
import fetch from 'node-fetch';

async function testMcp() {
  const url = 'https://velora-849323590862.us-central1.run.app/api/mcp';
  console.log(`Testing MCP at ${url}...`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`GET failed: ${response.status} ${response.statusText}`);
      return;
    }

    const reader = response.body;
    let endpoint = '';

    // Read the first few chunks to find the endpoint
    for await (const chunk of reader) {
      const text = chunk.toString();
      console.log(`Received chunk: ${text}`);
      const match = text.match(/event: endpoint\ndata: (.*)\n\n/);
      if (match) {
        endpoint = match[1];
        break;
      }
    }

    if (!endpoint) {
      console.error('No endpoint found in SSE stream');
      return;
    }

    console.log(`Found endpoint: ${endpoint}`);

    // Test the endpoint with a list_tools request
    const postResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      })
    });

    if (!postResponse.ok) {
      console.error(`POST failed: ${postResponse.status} ${postResponse.statusText}`);
      const errorText = await postResponse.text();
      console.error(`Error body: ${errorText}`);
      return;
    }

    console.log('POST successful! MCP is working.');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testMcp();
