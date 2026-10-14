import { createServer } from 'node:http'
import { Worker } from 'node:worker_threads'
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { CATALOG } from '../src/model/catalog'
import { boardConfigOf, type ComponentInstance } from '../src/model/types'
import { buildNetlist } from '../src/sim/netlist'
import { componentPinHoles, formatHole } from '../src/model/breadboard'
import { buildSystemPrompt } from '../src/llm/prompt'
import { CIRCUIT_OUTPUT_SCHEMA } from '../src/llm/schema'
import {
  create,
  get,
  save,
  history,
  snapshot,
  documents,
  remove,
  valid,
} from './workspaces'
const ROOT = resolve(process.env.OHMLET_ROOT || process.cwd())
const INSTRUCTIONS =
  'Ohmlet virtual electronics workbench. Start with workspaces_list and workspace_read. Browser workspaces are live when browser.connected is true. Fetch catalog_detail for parts you use; do not guess pins or parameters. Apply atomic edits with expectedRevision, then simulate and verify measured behavior. Existing UI AI generation remains available; this server lets the calling AI design, test and repair directly. FireBeetle supports modeled GPIO/PWM/ADC, reset and button, not firmware execution, Wi-Fi or hardware flashing. Simulation is approximate, not a real-world electrical safety certification.'
const clients = new Map<string, any>()
let activeJobs = 0
function browser(id: string) {
  const c = clients.get(id)
  return c
    ? {
        connected: Date.now() - c.seen < 15000,
        lastSeen: new Date(c.seen).toISOString(),
        state: c.state,
        pendingCommands: c.commands.length,
      }
    : { connected: false }
}
function view(id: string) {
  return { ...snapshot(get(id)), browser: browser(id) }
}
function examples() {
  return readdirSync(resolve(ROOT, 'examples'))
    .filter((n) => n.endsWith('.json'))
    .map((n) => n.slice(0, -5))
}
function example(name: string) {
  if (!examples().includes(name)) throw Error('Unknown example')
  return JSON.parse(
    readFileSync(resolve(ROOT, 'examples', name + '.json'), 'utf8'),
  )
}
function job(data: any): Promise<any> {
  if (activeJobs >= 2) throw Error('Simulation queue busy; retry shortly')
  activeJobs++
  return new Promise((ok, no) => {
    const w = new Worker(new URL('./job.js', import.meta.url), {
      workerData: data,
      resourceLimits: { maxOldGenerationSizeMb: 192 },
    })
    let done = false
    const finish = (err: any, result?: any) => {
      if (done) return
      done = true
      clearTimeout(timer)
      activeJobs--
      void w.terminate()
      err ? no(err) : ok(result)
    }
    const timer = setTimeout(
      () => finish(Error('Simulation exceeded 30 second wall-time limit')),
      30000,
    )
    w.once('message', (r) => finish(r.error ? Error(r.error) : null, r))
    w.once('error', (e) => finish(e))
    w.once('exit', (c) => {
      if (!done) finish(Error('Simulation worker exited: ' + c))
    })
  })
}
const ws = z.string().default('main'),
  rev = z.number().int().nonnegative()
const anyLayout = z.object({
  version: z.literal(1),
  name: z.string().optional(),
  description: z.string().optional(),
  board: z.enum(['half', 'standard', 'labxl']).optional(),
  boardCount: z.number().int().min(1).max(6).optional(),
  boardRows: z.number().int().min(1).max(4).optional(),
  components: z.array(z.any()).max(150),
  wires: z.array(z.any()).max(600),
})
const expectations = z
  .array(
    z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('led_on'), target: z.string() }),
      z.object({ kind: z.literal('led_off'), target: z.string() }),
      z.object({
        kind: z.literal('led_blinks'),
        target: z.string(),
        minHz: z.number().positive().optional(),
        maxHz: z.number().positive().optional(),
      }),
      z.object({
        kind: z.literal('segments_show'),
        target: z.string(),
        digit: z.enum(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']),
      }),
      z.object({ kind: z.literal('buzzer_sounds'), target: z.string() }),
      z.object({
        kind: z.literal('net_oscillates'),
        target: z.string(),
        minHz: z.number().positive().optional(),
        maxHz: z.number().positive().optional(),
      }),
      z.object({
        kind: z.literal('net_in_range'),
        target: z.string(),
        minV: z.number(),
        maxV: z.number(),
      }),
    ]),
  )
  .max(32)
function makeServer() {
  const s = new McpServer(
    { name: 'ohmlet-workbench', version: '1.0.0' },
    { instructions: INSTRUCTIONS },
  )
  function tool(
    name: string,
    description: string,
    inputSchema: any,
    fn: (a: any) => any,
    read = false,
    destructive = false,
  ) {
    s.registerTool(
      name,
      {
        description,
        inputSchema,
        annotations: {
          readOnlyHint: read,
          destructiveHint: destructive,
          idempotentHint: read,
          openWorldHint: false,
        },
      },
      async (a: any) => {
        try {
          const result = await fn(a)
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
            structuredContent:
              typeof result === 'object' && !Array.isArray(result)
                ? result
                : { result },
          }
        } catch (e: any) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: e.message }],
          }
        }
      },
    )
  }
  tool(
    'workspaces_list',
    'List persisted workspaces, revisions, and connected workbench browsers.',
    {},
    () => ({
      workspaces: [...documents.values()].map((d) => ({
        id: d.id,
        name: d.layout.name,
        revision: d.revision,
        components: d.layout.components.length,
        wires: d.layout.wires.length,
        browser: browser(d.id),
      })),
    }),
    true,
  )
  tool(
    'workspace_read',
    'Read complete current layout, revision, undo/redo availability and browser status.',
    { workspace: ws },
    (a) => view(a.workspace),
    true,
  )
  tool(
    'workspace_create',
    'Create a named isolated workspace; optional validated initial circuit.',
    { workspace: z.string(), layout: anyLayout.optional() },
    (a) => {
      create(a.workspace, a.layout || { version: 1, components: [], wires: [] })
      return view(a.workspace)
    },
  )
  tool(
    'workspace_delete',
    'Delete an inactive workspace permanently. Refuses main, connected browsers and stale revisions.',
    { workspace: z.string(), expectedRevision: rev },
    (a) => {
      if (browser(a.workspace).connected)
        throw Error(
          'Close the browser and wait for its connection to expire before deleting',
        )
      const result = remove(a.workspace, a.expectedRevision)
      clients.delete(a.workspace)
      return result
    },
    false,
    true,
  )
  tool(
    'workspace_replace',
    'Atomically validate and replace a workspace. Browser applies revision on next poll. Use read revision to avoid overwriting intervening edits.',
    { workspace: ws, expectedRevision: rev, layout: anyLayout },
    (a) => {
      save(a.workspace, a.expectedRevision, a.layout)
      return view(a.workspace)
    },
  )
  tool(
    'workspace_edit',
    'Apply an atomic batch. Add/update/remove components or wires; set board metadata. Updating params merges keys. Removal also removes wires addressed to removed offboard terminals. Validation rejects the entire batch on any error.',
    {
      workspace: ws,
      expectedRevision: rev,
      operations: z
        .array(
          z.object({
            op: z.enum([
              'add_component',
              'update_component',
              'remove_component',
              'add_wire',
              'update_wire',
              'remove_wire',
              'set_board',
            ]),
            id: z.string().optional(),
            value: z.record(z.string(), z.unknown()).optional(),
          }),
        )
        .min(1)
        .max(300),
    },
    (a) => {
      const l = structuredClone(get(a.workspace).layout)
      for (const o of a.operations) {
        if (o.op === 'set_board') {
          for (const k of Object.keys(o.value || {}))
            if (
              ![
                'board',
                'boardCount',
                'boardRows',
                'name',
                'description',
              ].includes(k)
            )
              throw Error('Invalid board metadata: ' + k)
          Object.assign(l, o.value)
          continue
        }
        const component = o.op.endsWith('component'),
          list = component ? l.components : l.wires
        if (o.op.startsWith('add_')) {
          if (!o.value?.id) throw Error('Add requires value.id')
          list.push(o.value)
          continue
        }
        const i = list.findIndex((p: any) => p.id === o.id)
        if (i < 0) throw Error('Unknown id: ' + o.id)
        if (o.op.startsWith('remove_')) {
          list.splice(i, 1)
          if (component)
            l.wires = l.wires.filter(
              (w: any) =>
                !w.from.startsWith(o.id + ':') && !w.to.startsWith(o.id + ':'),
            )
        } else {
          if (o.value?.id && o.value.id !== o.id)
            throw Error('Changing ids is not supported')
          const old = list[i]
          list[i] = {
            ...old,
            ...o.value,
            ...(component && o.value?.params
              ? {
                  params: {
                    ...(old as ComponentInstance).params,
                    ...o.value.params,
                  },
                }
              : {}),
          }
        }
      }
      save(a.workspace, a.expectedRevision, l)
      return view(a.workspace)
    },
  )
  tool(
    'workspace_history',
    'Undo or redo one server edit; revision checked.',
    {
      workspace: ws,
      expectedRevision: rev,
      direction: z.enum(['undo', 'redo']),
    },
    (a) => {
      history(a.workspace, a.expectedRevision, a.direction)
      return view(a.workspace)
    },
  )
  tool(
    'catalog_search',
    'Compact catalog index filtered by keyword/category. Fetch detail before wiring.',
    { query: z.string().default(''), category: z.string().optional() },
    (a) => ({
      parts: Object.values(CATALOG)
        .filter(
          (p) =>
            (!a.category || p.category === a.category) &&
            (p.type + ' ' + p.label)
              .toLowerCase()
              .includes(a.query.toLowerCase()),
        )
        .map((p) => ({
          type: p.type,
          label: p.label,
          category: p.category,
          placement: p.placement,
          pins: p.pins.length,
        })),
    }),
    true,
  )
  tool(
    'catalog_detail',
    'Exact ordered pins, aliases/bridges, parameter defaults/bounds, footprint, simulation model and usage documentation for specified types.',
    { types: z.array(z.string()).min(1).max(12) },
    (a) => ({
      parts: a.types.map((t: string) => {
        const p = CATALOG[t]
        if (!p) throw Error('Unknown component type ' + t)
        return p
      }),
    }),
    true,
  )
  tool(
    'examples_list',
    'List the available original and FireBeetle learning circuits.',
    {},
    () => ({ examples: examples() }),
    true,
  )
  tool(
    'example_read',
    'Read an example without replacing a workspace.',
    { name: z.string() },
    (a) => ({ layout: example(a.name) }),
    true,
  )
  tool(
    'example_load',
    'Load a validated example as an undoable workspace edit.',
    { workspace: ws, expectedRevision: rev, name: z.string() },
    (a) => {
      save(a.workspace, a.expectedRevision, example(a.name))
      return view(a.workspace)
    },
  )
  tool(
    'circuit_validate',
    'Validate a proposed layout without saving it. Detect occupancy, occlusion, invalid terminals, ranges and placement errors.',
    { layout: anyLayout },
    (a) => ({ valid: true, layout: valid(a.layout) }),
    true,
  )
  tool(
    'circuit_connectivity',
    'Inspect merged nets and exact component pin references. Optional endpoint queries show which nets are electrically joined.',
    { workspace: ws, refs: z.array(z.string()).max(100).default([]) },
    (a) => {
      const l = get(a.workspace).layout,
        n = buildNetlist(l)
      return {
        ground: n.ground,
        nets: n.nets,
        warnings: n.warnings,
        endpoints: Object.fromEntries(
          a.refs.map((r: string) => [r, n.netOf(r)]),
        ),
        components: l.components.map((c: any) => {
          const p = CATALOG[c.type],
            holes = componentPinHoles(c, p, boardConfigOf(l))
          return {
            id: c.id,
            type: c.type,
            pins: p.pins.map((pin: string, i: number) => {
              const ref =
                p.placement === 'offboard'
                  ? c.id + ':' + pin
                  : holes?.[i]
                    ? formatHole(holes[i])
                    : null
              return { pin, ref, net: ref ? n.netOf(ref) : null }
            }),
          }
        }),
      }
    },
    true,
  )
  tool(
    'simulation_run',
    'Run a fresh deterministic simulation of the current revision in an isolated worker. Return telemetry, issues, endpoint voltages, optional sampled voltage trace. Does not advance the browser simulation. Limits: 8 seconds, 200000 steps, 1000 samples.',
    {
      workspace: ws,
      seconds: z.number().positive().max(8).default(0.1),
      dt: z.number().min(0.00001).max(0.01).default(0.00005),
      refs: z.array(z.string()).max(32).default([]),
      samples: z.number().int().min(0).max(1000).default(0),
    },
    async (a) => {
      if (Math.ceil(a.seconds / a.dt) > 200000)
        throw Error('Step limit exceeded')
      const d = get(a.workspace),
        revision = d.revision
      const net = buildNetlist(d.layout)
      for (const ref of a.refs)
        if (!net.netOf(ref)) throw Error('Unknown net endpoint ' + ref)
      return {
        workspace: a.workspace,
        revision,
        ...(await job({ ...a, kind: 'simulate', layout: d.layout })),
      }
    },
    true,
  )
  tool(
    'simulation_sweep',
    'Compare up to 8 parameter values with fresh deterministic simulations. Does not modify layout. Useful for resistor selection, potentiometer transfer, GPIO/PWM and RC behavior. Returns measured voltages, device telemetry and issues for each value.',
    {
      workspace: ws,
      component: z.string(),
      param: z.string(),
      values: z
        .array(z.union([z.number(), z.string(), z.boolean()]))
        .min(1)
        .max(8),
      seconds: z.number().positive().max(1).default(0.1),
      refs: z.array(z.string()).max(16).default([]),
    },
    async (a) => {
      const d = get(a.workspace),
        revision = d.revision,
        c = d.layout.components.find((c: any) => c.id === a.component)
      if (!c) throw Error('Unknown component')
      if (!CATALOG[c.type].params?.some((p) => p.key === a.param))
        throw Error('Unknown catalog parameter')
      const layouts = a.values.map((v: any) => {
        const l = structuredClone(d.layout),
          part = l.components.find((p: any) => p.id === a.component)!
        part.params = { ...part.params, [a.param]: v }
        return valid(l)
      })
      const n = buildNetlist(d.layout)
      for (const ref of a.refs)
        if (!n.netOf(ref)) throw Error('Unknown endpoint ' + ref)
      const results = []
      for (let i = 0; i < layouts.length; i++)
        results.push({
          value: a.values[i],
          ...(await job({
            kind: 'simulate',
            layout: layouts[i],
            seconds: a.seconds,
            refs: a.refs,
          })),
        })
      return {
        workspace: a.workspace,
        revision,
        component: a.component,
        param: a.param,
        results,
      }
    },
    true,
  )
  tool(
    'circuit_verify',
    'Run shared AI verification: expectations plus automatic health checks. Reports measured failures for repair. target uses component id for device checks and endpoint reference for net checks.',
    { workspace: ws, expectations },
    async (a) => {
      const d = get(a.workspace)
      for (const e of a.expectations) {
        if (
          !e.kind.startsWith('net_') &&
          !d.layout.components.some((c: any) => c.id === e.target)
        )
          throw Error('Unknown expectation component ' + e.target)
        if (
          e.kind.startsWith('net_') &&
          !buildNetlist(d.layout).netOf(e.target)
        )
          throw Error('Unknown net endpoint ' + e.target)
        if (e.kind === 'net_in_range' && e.minV > e.maxV)
          throw Error('minV must be <= maxV')
        if (e.minHz && e.maxHz && e.minHz > e.maxHz)
          throw Error('minHz must be <= maxHz')
      }
      return {
        workspace: a.workspace,
        revision: d.revision,
        ...(await job({
          kind: 'verify',
          layout: d.layout,
          expectations: a.expectations,
        })),
      }
    },
    true,
  )
  tool(
    'circuit_verify_apply',
    'Validate and simulate a proposed circuit before publishing it. Applies only if every expectation and health check passes. Failed verification returns measured failures and leaves workspace unchanged; revision checked again after simulation.',
    { workspace: ws, expectedRevision: rev, layout: anyLayout, expectations },
    async (a) => {
      if (get(a.workspace).revision !== a.expectedRevision)
        throw Error('Revision conflict: read workspace again')
      const layout = valid(a.layout),
        net = buildNetlist(layout)
      for (const e of a.expectations) {
        if (
          e.kind.startsWith('net_')
            ? !net.netOf(e.target)
            : !layout.components.some((c) => c.id === e.target)
        )
          throw Error('Unknown expectation target ' + e.target)
        if (e.kind === 'net_in_range' && e.minV > e.maxV)
          throw Error('minV must be <= maxV')
        if (e.minHz && e.maxHz && e.minHz > e.maxHz)
          throw Error('minHz must be <= maxHz')
      }
      const verification = await job({
        kind: 'verify',
        layout,
        expectations: a.expectations,
      })
      if (!verification.pass) return { applied: false, verification }
      save(a.workspace, a.expectedRevision, layout)
      return { applied: true, verification, ...view(a.workspace) }
    },
  )
  tool(
    'browser_control',
    'Queue a run/pause/reset/select command for the connected browser. Delivery status can be inspected in workspace_read. Browser commands are asynchronous; simulation_run is deterministic server measurement.',
    {
      workspace: ws,
      action: z.enum(['run', 'pause', 'reset', 'select']),
      ids: z.array(z.string()).max(150).optional(),
    },
    (a) => {
      const c = clients.get(a.workspace)
      if (!c || Date.now() - c.seen > 15000)
        throw Error('No connected browser for this workspace')
      if (c.commands.length >= 20) throw Error('Browser command queue full')
      const command = { id: randomUUID(), action: a.action, ids: a.ids || [] }
      c.commands.push(command)
      return { queued: command }
    },
  )
  tool(
    'design_context',
    'Get the existing full designer system prompt and structured output schema on demand. Usually catalog_detail + workspace_read is smaller. No API keys or hidden conversation data included.',
    { workspace: ws },
    (a) => ({
      systemPrompt: buildSystemPrompt(boardConfigOf(get(a.workspace).layout)),
      outputSchema: CIRCUIT_OUTPUT_SCHEMA,
      instructions: INSTRUCTIONS,
    }),
    true,
  )
  s.registerResource(
    'guide',
    'ohmlet://guide',
    {
      mimeType: 'text/plain',
      description: 'Workflow, layout format, limits and simulation semantics',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text:
            INSTRUCTIONS +
            '\nLayouts: {version:1, board?:half|standard|labxl, boardCount?:1..6, boardRows?:1..4, components:[{id,type,params?:object,holes?:string[],at?:string,rotation?:0|90|180|270,pos?:{x,z}}],wires:[{id,from,to,color?}]}. Breadboard a-e and f-j connect vertically within each numbered column. Channel separates them. Rails are top+/top-/bot+/bot- with index. Additional board rows use 1: prefix. Offboard endpoints use ID:PIN. Use catalog pin order. Headless workspace edits are persisted, undoable and revision checked. Browser workspaces begin with browser- and sync through same-origin REST; never include AI API keys. Trace samples contain endpoint voltages only; telemetry contains modeled device outputs.',
        },
      ],
    }),
  )
  s.registerResource(
    'catalog',
    'ohmlet://catalog',
    { mimeType: 'application/json' },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(
            Object.values(CATALOG).map((p) => ({
              type: p.type,
              label: p.label,
              placement: p.placement,
            })),
          ),
        },
      ],
    }),
  )
  s.registerResource(
    'workspace',
    new ResourceTemplate('ohmlet://workspace/{id}', {
      list: async () => ({
        resources: [...documents.keys()].map((id) => ({
          uri: 'ohmlet://workspace/' + id,
          name: id,
        })),
      }),
    }),
    { mimeType: 'application/json' },
    async (uri, { id }) => ({
      contents: [{ uri: uri.href, text: JSON.stringify(view(String(id))) }],
    }),
  )
  s.registerPrompt(
    'design-circuit',
    {
      description:
        'Design, validate, simulate and repair a circuit in an explicit workspace.',
      argsSchema: { request: z.string(), workspace: z.string().optional() },
    },
    async (a) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              INSTRUCTIONS +
              '\nWorkspace: ' +
              (a.workspace || 'main') +
              '\nRequest: ' +
              a.request +
              '\nRead current workspace first, fetch relevant catalog entries, apply revision-checked edits, then verify declared observable expectations. Explain measured results and any approximation.',
          },
        },
      ],
    }),
  )
  s.registerPrompt(
    'debug-circuit',
    {
      description:
        'Diagnose a circuit using current layout, nets, telemetry and verification.',
      argsSchema: { symptom: z.string(), workspace: z.string().optional() },
    },
    async (a) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              INSTRUCTIONS +
              '\nDiagnose workspace ' +
              (a.workspace || 'main') +
              ': ' +
              a.symptom +
              '. Read layout, inspect relevant pins/nets, simulate and measure before proposing or applying a repair. Preserve unrelated circuitry.',
          },
        },
      ],
    }),
  )
  return s
}
async function body(req: any) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 1000000) throw Error('Request body exceeds 1MB')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : {}
}

const port = Number(process.env.OHMLET_MCP_PORT || 5174),
  hosts = new Set([
    'localhost',
    '127.0.0.1',
    'acer-gnmd.merino-ayu.ts.net',
    ...(process.env.OHMLET_ALLOWED_HOSTS || '').split(',').filter(Boolean),
  ])
const origins = new Set([
  'https://acer-gnmd.merino-ayu.ts.net',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  ...(process.env.OHMLET_ALLOWED_ORIGINS || '').split(',').filter(Boolean),
])
function allowed(req: any) {
  let h
  try {
    h = new URL('http://' + req.headers.host).hostname
  } catch {
    return false
  }
  if (!hosts.has(h)) return false
  const origin = req.headers.origin
  if (origin) {
    try {
      const o = new URL(origin)
      if (
        !['http:', 'https:'].includes(o.protocol) ||
        (o.host !== req.headers.host && !origins.has(o.origin))
      )
        return false
    } catch {
      return false
    }
  }
  return true
}
const http = createServer(async (req, res) => {
  function json(status: number, v: any) {
    res.writeHead(status, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    })
    res.end(JSON.stringify(v))
  }
  try {
    if (!allowed(req)) return json(403, { error: 'Host or Origin denied' })
    if (
      process.env.OHMLET_MCP_TOKEN &&
      req.headers.authorization !== 'Bearer ' + process.env.OHMLET_MCP_TOKEN &&
      req.url?.startsWith('/mcp')
    )
      return json(401, { error: 'Bearer token required' })
    const url = new URL(req.url!, 'http://localhost')
    if (url.pathname === '/mcp') {
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST' })
        res.end()
        return
      }
      const server = makeServer(),
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        })
      res.on('close', () => {
        void transport.close()
        void server.close()
      })
      await server.connect(transport)
      await transport.handleRequest(req, res, await body(req))
      return
    }
    if (url.pathname === '/api/mcp/health')
      return json(200, {
        name: 'ohmlet-workbench',
        version: '1.0.0',
        endpoint: '/mcp',
        tools: 20,
      })
    if (url.pathname === '/api/mcp/sync' && req.method === 'POST') {
      const a = await body(req)
      identifierBrowser(a.workspace)
      let accepted = false
      let d = documents.get(a.workspace)
      if (!d) {
        if (!a.layout) throw Error('Initial browser layout required')
        d = create(a.workspace, a.layout)
        accepted = true
      }
      let c = clients.get(a.workspace)
      if (!c) {
        c = { seen: Date.now(), commands: [], state: {} }
        clients.set(a.workspace, c)
      }
      c.seen = Date.now()
      c.state = {
        running: !!a.running,
        simTime: typeof a.simTime === 'number' ? a.simTime : 0,
        selection: Array.isArray(a.selection) ? a.selection.slice(0, 150) : [],
        telemetry: a.telemetry || null,
        lastCommand: a.lastCommand,
      }
      if (a.layout && a.expectedRevision === d.revision) {
        save(a.workspace, a.expectedRevision, a.layout)
        d = get(a.workspace)
        accepted = true
      }
      const acknowledged = c.commands.findIndex(
        (cmd: any) => cmd.id === a.lastCommand?.id,
      )
      if (acknowledged >= 0) c.commands.splice(0, acknowledged + 1)
      const commands = c.commands.slice()
      return json(200, { ...snapshot(d), commands, accepted })
    }
    json(404, { error: 'Not found' })
  } catch (e: any) {
    json(e.message.startsWith('Revision conflict') ? 409 : 400, {
      error: e.message,
    })
  }
})
function identifierBrowser(id: any) {
  if (typeof id !== 'string' || !/^browser-[a-zA-Z0-9_-]{1,60}$/.test(id))
    throw Error('Invalid browser workspace')
}
if (process.argv.includes('--stdio')) await import('./stdio.js')
else
  http.listen(port, '127.0.0.1', () =>
    console.error('Ohmlet MCP listening on loopback:' + port),
  )
