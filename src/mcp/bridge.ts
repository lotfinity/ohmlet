import { useStore } from '../state/store'

export function startMcpBridge() {
  let id = localStorage.getItem('bb.mcpWorkspace')
  if (!id) {
    id = 'browser-' + crypto.randomUUID()
    localStorage.setItem('bb.mcpWorkspace', id)
  }
  let revision: number | undefined,
    lastLayout = useStore.getState().layout,
    dirty = true,
    applying = false,
    stopped = false,
    lastCommand: any
  const unsubscribe = useStore.subscribe((s) => {
    if (s.layout !== lastLayout) {
      lastLayout = s.layout
      if (!applying) dirty = true
    }
  })
  async function sync() {
    if (stopped) return
    const s = useStore.getState(),
      sentLayout = s.layout,
      sentDirty = dirty
    try {
      const response = await fetch('/api/mcp/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspace: id,
          expectedRevision: revision,
          ...(dirty ? { layout: sentLayout } : {}),
          running: s.running,
          simTime: s.simTime,
          selection: s.selection,
          telemetry: s.telemetry,
          lastCommand,
        }),
      })
      const data = await response.json()
      if (stopped) return
      if (!response.ok) throw Error(data.error || 'MCP bridge unavailable')
      if (sentDirty && useStore.getState().layout === sentLayout) dirty = false
      const newerLocalEdit =
        sentDirty &&
        useStore.getState().layout !== sentLayout &&
        data.accepted === true
      if (
        !newerLocalEdit &&
        data.revision !== revision &&
        JSON.stringify(data.layout) !==
          JSON.stringify(useStore.getState().layout)
      ) {
        // Server revision wins an edit race; the browser's previous edit remains in its local undo history.
        applying = true
        const result = useStore.getState().loadLayout(data.layout)
        applying = false
        if (!result.ok) throw Error(result.errors.join('; '))
        dirty = false
        lastLayout = useStore.getState().layout
      }
      revision = data.revision
      for (const c of data.commands) {
        if (c.id === lastCommand?.id) continue
        const state = useStore.getState()
        if (c.action === 'run') state.startSim()
        if (c.action === 'pause') state.stopSim()
        if (c.action === 'reset') state.resetSim()
        if (c.action === 'select') state.marqueeSelect(c.ids)
        lastCommand = {
          id: c.id,
          action: c.action,
          appliedAt: new Date().toISOString(),
        }
      }
      document.documentElement.dataset.mcpStatus = 'connected'
      document.documentElement.dataset.mcpWorkspace = id!
    } catch {
      document.documentElement.dataset.mcpStatus = 'offline'
    }
    if (!stopped) setTimeout(sync, 1500)
  }
  void sync()
  return () => {
    stopped = true
    unsubscribe()
  }
}
