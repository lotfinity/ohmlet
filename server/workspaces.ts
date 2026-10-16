import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { validateLayout } from '../src/model/validate'
import { DEFAULT_BOARD } from '../src/model/types'
import type { CircuitLayout } from '../src/model/types'
export interface Workspace {
  id: string
  revision: number
  layout: CircuitLayout
  undo: CircuitLayout[]
  redo: CircuitLayout[]
  updatedAt: string
}
export const DATA =
  process.env.OHMLET_DATA_DIR || join(homedir(), '.local/share/ohmlet-mcp')
mkdirSync(DATA, { recursive: true, mode: 0o700 })
export const documents = new Map<string, Workspace>()
export function identifier(id: string) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw Error('Invalid workspace id')
  return id
}
export function valid(raw: any): CircuitLayout {
  if (!raw || !Array.isArray(raw.components) || !Array.isArray(raw.wires))
    throw Error('Layout requires components and wires arrays')
  if (raw.components.length > 150 || raw.wires.length > 600)
    throw Error('Limit: 150 components / 600 wires')
  const v = validateLayout(raw)
  if (!v.ok) throw Error(v.errors.join('\n'))
  return v.layout!
}
try {
  const stored = JSON.parse(readFileSync(join(DATA, 'workspaces.json'), 'utf8'))
  if (!Array.isArray(stored) || stored.length > 100)
    throw Error('Invalid persisted workspace collection')
  for (const d of stored) {
    identifier(d.id)
    if (
      !Number.isSafeInteger(d.revision) ||
      d.revision < 0 ||
      !Array.isArray(d.undo) ||
      !Array.isArray(d.redo)
    )
      throw Error('Invalid persisted workspace ' + d.id)
    documents.set(d.id, {
      ...d,
      layout: valid(d.layout),
      undo: d.undo.slice(-30).map(valid),
      redo: d.redo.slice(-30).map(valid),
    })
  }
} catch (e: any) {
  if (e.code !== 'ENOENT') throw e
}
function persist(next: ReadonlyMap<string, Workspace>) {
  const p = join(DATA, 'workspaces.json')
  writeFileSync(p + '.tmp', JSON.stringify([...next.values()]), { mode: 0o600 })
  renameSync(p + '.tmp', p)
}
function commit(next: Workspace) {
  const candidate = new Map(documents)
  candidate.set(next.id, next)
  persist(candidate)
  documents.set(next.id, next)
  return next
}
export function get(id = 'main'): Workspace {
  identifier(id)
  const d = documents.get(id)
  if (!d) throw Error('Unknown workspace: ' + id)
  return d
}
export function create(id: string, layout: any) {
  identifier(id)
  if (documents.has(id)) throw Error('Workspace already exists')
  if (documents.size >= 100) throw Error('Workspace limit reached')
  return commit({
    id,
    revision: 0,
    layout: valid(layout),
    undo: [],
    redo: [],
    updatedAt: new Date().toISOString(),
  })
}
function checkRevision(d: Workspace, revision: number) {
  if (d.revision !== revision)
    throw Error(
      'Revision conflict: expected ' +
        revision +
        ', current ' +
        d.revision +
        '. Read workspace again.',
    )
}
export function save(id: string, revision: number, layout: any) {
  const d = get(id)
  checkRevision(d, revision)
  return commit({
    ...d,
    layout: valid(layout),
    undo: [...d.undo, d.layout].slice(-30),
    redo: [],
    revision: d.revision + 1,
    updatedAt: new Date().toISOString(),
  })
}
export function history(
  id: string,
  revision: number,
  direction: 'undo' | 'redo',
) {
  const d = get(id)
  checkRevision(d, revision)
  const from = d[direction],
    other = direction === 'undo' ? 'redo' : 'undo'
  if (!from.length) throw Error('No ' + direction + ' available')
  return commit({
    ...d,
    layout: from[from.length - 1],
    [direction]: from.slice(0, -1),
    [other]: [...d[other], d.layout].slice(-30),
    revision: d.revision + 1,
    updatedAt: new Date().toISOString(),
  })
}
export function remove(id: string, revision: number) {
  const d = get(id)
  checkRevision(d, revision)
  if (id === 'main') throw Error('The main workspace cannot be deleted')
  const candidate = new Map(documents)
  candidate.delete(id)
  persist(candidate)
  documents.delete(id)
  return { deleted: id }
}
export function snapshot(d: Workspace) {
  return {
    id: d.id,
    revision: d.revision,
    layout: d.layout,
    updatedAt: d.updatedAt,
    canUndo: !!d.undo.length,
    canRedo: !!d.redo.length,
  }
}
if (!documents.has('main'))
  create('main', {
    version: 1,
    name: 'MCP workspace',
    board: DEFAULT_BOARD,
    components: [],
    wires: [],
  })
