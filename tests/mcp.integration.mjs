import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
const data = mkdtempSync(join(tmpdir(), 'ohmlet-mcp-test-'))
const port = 5184,
  url = 'http://127.0.0.1:' + port
let child, client
async function start() {
  child = spawn(process.execPath, ['server/dist/index.js'], {
    env: {
      ...process.env,
      OHMLET_MCP_PORT: String(port),
      OHMLET_DATA_DIR: data,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  child.stderr.on('data', (b) => process.stderr.write(b))
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url + '/api/mcp/health')).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  throw Error('Server startup timed out')
}
async function connect() {
  client = new Client({ name: 'ohmlet-integration', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(url + '/mcp')))
}
async function call(name, args = {}, error = false) {
  const r = await client.callTool({ name, arguments: args })
  if (error) {
    assert.equal(r.isError, true)
    return r
  }
  assert.ok(!r.isError, JSON.stringify(r))
  return JSON.parse(r.content[0].text)
}
async function sync(body) {
  const response = await fetch(url + '/api/mcp/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  assert.equal(response.status, 200)
  return response.json()
}
async function stop() {
  await client?.close()
  const c = child
  c.kill()
  await new Promise((r) => c.once('exit', r))
}
try {
  await start()
  await connect()
  const tools = await client.listTools()
  assert.ok(tools.tools.length >= 18)
  const resources = await client.listResources()
  assert.ok(resources.resources.some((r) => r.uri === 'ohmlet://guide'))
  const templates = await client.listResourceTemplates()
  assert.equal(templates.resourceTemplates.length, 1)
  assert.equal((await client.listPrompts()).prompts.length, 2)
  assert.ok(
    (
      await client.getPrompt({
        name: 'design-circuit',
        arguments: { request: 'blink an LED' },
      })
    ).messages[0].content.text.includes('blink an LED'),
  )
  assert.ok(
    (await call('catalog_search', { query: 'firebeetle' })).parts.length,
  )
  const parts = await call('catalog_detail', { types: ['firebeetle_esp32e'] })
  assert.equal(parts.parts[0].pins.length, 32)
  assert.equal((await fetch(url + '/mcp')).status, 405)
  assert.equal(
    (
      await fetch(url + '/mcp', {
        method: 'POST',
        headers: {
          origin: 'https://evil.example',
          'content-type': 'application/json',
        },
        body: '{}',
      })
    ).status,
    403,
  )
  assert.equal(
    (
      await fetch(url + '/mcp', {
        method: 'POST',
        headers: {
          origin: 'http://127.0.0.1:9999',
          'content-type': 'application/json',
        },
        body: '{}',
      })
    ).status,
    403,
  )
  const examples = (await call('examples_list')).examples
  assert.ok(examples.includes('firebeetle-blink'))
  const circuit = (await call('example_read', { name: 'firebeetle-blink' }))
    .layout
  await call('workspace_create', { workspace: 'test', layout: circuit })
  let d = await call('workspace_read', { workspace: 'test' })
  assert.equal(d.revision, 0)
  const net = await call('circuit_connectivity', { workspace: 'test' })
  assert.equal(
    net.components.find((c) => c.type === 'firebeetle_esp32e').pins.length,
    32,
  )
  const esp = circuit.components.find((c) => c.type === 'firebeetle_esp32e')
  const sim = await call('simulation_run', {
    workspace: 'test',
    seconds: 0.1,
    refs: [esp.id + ':3V3'],
    samples: 10,
  })
  assert.ok(Math.abs(sim.voltages[esp.id + ':3V3'] - 3.3) < 0.01)
  assert.ok(sim.trace.length <= 10)
  const sweep = await call('simulation_sweep', {
    workspace: 'test',
    component: esp.id,
    param: 'gpio2_duty',
    values: [0.2, 0.8],
    refs: [esp.id + ':GPIO2'],
    seconds: 0.5,
  })
  assert.equal(sweep.results.length, 2)
  assert.ok(
    sweep.results[1].voltages[esp.id + ':GPIO2'] -
      sweep.results[0].voltages[esp.id + ':GPIO2'] >
      3,
  )
  assert.equal(
    (
      await call('circuit_verify', {
        workspace: 'test',
        expectations: [
          {
            kind: 'net_in_range',
            target: esp.id + ':3V3',
            minV: 3.2,
            maxV: 3.4,
          },
        ],
      })
    ).pass,
    true,
  )
  await call('workspace_edit', {
    workspace: 'test',
    expectedRevision: 0,
    operations: [{ op: 'set_board', value: { name: 'Edited circuit' } }],
  })
  await call(
    'workspace_edit',
    {
      workspace: 'test',
      expectedRevision: 0,
      operations: [{ op: 'set_board', value: { name: 'Stale edit' } }],
    },
    true,
  )
  await call(
    'workspace_edit',
    {
      workspace: 'test',
      expectedRevision: 1,
      operations: [
        { op: 'add_component', value: { id: 'INVALID', type: 'unrecognized' } },
      ],
    },
    true,
  )
  d = await call('workspace_read', { workspace: 'test' })
  assert.equal(d.revision, 1)
  assert.equal(d.layout.name, 'Edited circuit')
  await call('workspace_history', {
    workspace: 'test',
    expectedRevision: 1,
    direction: 'undo',
  })
  await call('workspace_history', {
    workspace: 'test',
    expectedRevision: 2,
    direction: 'redo',
  })
  let b = await sync({ workspace: 'browser-integration', layout: circuit })
  assert.equal(b.revision, 0)
  await call('workspace_edit', {
    workspace: 'browser-integration',
    expectedRevision: 0,
    operations: [{ op: 'set_board', value: { name: 'Remote browser edit' } }],
  })
  b = await sync({
    workspace: 'browser-integration',
    expectedRevision: 0,
    layout: { ...circuit, name: 'Stale browser edit' },
  })
  assert.equal(b.layout.name, 'Remote browser edit')
  assert.equal(b.accepted, false)
  const command = await call('browser_control', {
    workspace: 'browser-integration',
    action: 'pause',
  })
  b = await sync({ workspace: 'browser-integration', expectedRevision: 1 })
  assert.equal(b.commands[0].id, command.queued.id)
  b = await sync({ workspace: 'browser-integration', expectedRevision: 1 })
  assert.equal(b.commands.length, 1)
  b = await sync({
    workspace: 'browser-integration',
    expectedRevision: 1,
    lastCommand: { id: command.queued.id },
  })
  assert.equal(b.commands.length, 0)
  const context = await call('design_context', { workspace: 'test' })
  assert.ok(!context.systemPrompt.includes('There is no microcontroller'))
  assert.ok(context.systemPrompt.includes('FireBeetle'))
  mkdirSync(join(data, 'workspaces.json.tmp'))
  await call(
    'workspace_edit',
    {
      workspace: 'test',
      expectedRevision: 3,
      operations: [
        { op: 'set_board', value: { name: 'Disk failure must not apply' } },
      ],
    },
    true,
  )
  assert.equal(
    (await call('workspace_read', { workspace: 'test' })).revision,
    3,
  )
  rmSync(join(data, 'workspaces.json.tmp'), { recursive: true })
  await call('workspace_create', { workspace: 'disposable' })
  await call(
    'workspace_delete',
    { workspace: 'disposable', expectedRevision: 1 },
    true,
  )
  await call('workspace_delete', {
    workspace: 'disposable',
    expectedRevision: 0,
  })
  await call('workspace_read', { workspace: 'disposable' }, true)
  await call(
    'workspace_delete',
    { workspace: 'main', expectedRevision: 0 },
    true,
  )
  await call(
    'workspace_delete',
    { workspace: 'browser-integration', expectedRevision: 1 },
    true,
  )
  await call('workspace_create', { workspace: 'verified' })
  const bad = await call('circuit_verify_apply', {
    workspace: 'verified',
    expectedRevision: 0,
    layout: circuit,
    expectations: [
      { kind: 'net_in_range', target: esp.id + ':3V3', minV: 4, maxV: 5 },
    ],
  })
  assert.equal(bad.applied, false)
  assert.equal(
    (await call('workspace_read', { workspace: 'verified' })).revision,
    0,
  )
  const good = await call('circuit_verify_apply', {
    workspace: 'verified',
    expectedRevision: 0,
    layout: circuit,
    expectations: [
      { kind: 'net_in_range', target: esp.id + ':3V3', minV: 3.2, maxV: 3.4 },
    ],
  })
  assert.equal(good.applied, true)
  assert.equal(good.revision, 1)
  const local = new Client({ name: 'stdio-test', version: '1' })
  try {
    await local.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ['server/dist/stdio.js'],
        env: { ...process.env, OHMLET_MCP_URL: url + '/mcp' },
      }),
    )
    const shared = await local.callTool({
      name: 'workspace_read',
      arguments: { workspace: 'test' },
    })
    assert.equal(JSON.parse(shared.content[0].text).revision, 3)
    assert.equal((await local.listTools()).tools.length, 20)
  } finally {
    await local.close()
  }
  await stop()
  await start()
  await connect()
  d = await call('workspace_read', { workspace: 'test' })
  assert.equal(d.revision, 3)
  assert.equal(d.layout.name, 'Edited circuit')
  console.log(
    JSON.stringify({
      pass: true,
      tools: tools.tools.map((t) => t.name),
      resources: resources.resources.length,
      prompts: 2,
      persistence: true,
      simulation3V3: sim.voltages[esp.id + ':3V3'],
      bridgeConflict: true,
      commandAcknowledgement: true,
    }),
  )
} finally {
  if (child && !child.killed) await stop()
  rmSync(data, { recursive: true, force: true })
}
