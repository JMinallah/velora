const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const TOOLS_API_KEY = process.env.TOOLS_API_KEY

function withToolHeaders(extra = {}) {
  return {
    ...extra,
    ...(TOOLS_API_KEY ? { 'x-tools-api-key': TOOLS_API_KEY } : {}),
  }
}

async function run() {
  console.log('Fetching tool manifest')
  const manifestRes = await fetch(`${BASE}/api/agent/tools`)
  console.log('manifest status', manifestRes.status)
  const manifest = await manifestRes.json()
  console.log(JSON.stringify(manifest, null, 2))

  // Try creating a mission
  console.log('Creating test mission')
  const createRes = await fetch(`${BASE}/api/tools/createMission`, {
    method: 'POST',
    headers: withToolHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({
      title: 'Test mission from script',
      overview: 'Created by scripts/test_tools.mjs',
      nextStep: 'Run integration checks',
      source: 'agent',
    }),
  })
  const created = await createRes.json()
  console.log('create mission', createRes.status, JSON.stringify(created, null, 2))

  if (!created?.data?.id) {
    console.error('Mission creation failed; aborting remaining checks')
    return
  }

  const missionId = created.data.id

  // Create a task
  const taskRes = await fetch(`${BASE}/api/tools/createTask`, {
    method: 'POST',
    headers: withToolHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ missionId, label: 'Follow-up task', category: 'General', source: 'agent' }),
  })
  console.log('create task', taskRes.status, await taskRes.text())

  // List events
  const eventsRes = await fetch(`${BASE}/api/tools/listEvents?missionId=${missionId}`, {
    headers: withToolHeaders(),
  })
  console.log('events', eventsRes.status, await eventsRes.text())
}

run().catch((err) => { console.error(err); process.exit(1) })
