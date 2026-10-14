import { useEffect, useState } from 'react'
export function McpStatus() {
  const [status, setStatus] = useState('connecting'),
    [workspace, setWorkspace] = useState('')
  useEffect(() => {
    const update = () => {
      setStatus(document.documentElement.dataset.mcpStatus || 'connecting')
      setWorkspace(document.documentElement.dataset.mcpWorkspace || '')
    }
    update()
    const timer = setInterval(update, 1500)
    return () => clearInterval(timer)
  }, [])
  return (
    <div style={{ padding: '12px 18px', fontSize: 12, lineHeight: 1.6 }}>
      <strong>AI / MCP: {status}</strong>
      <br />
      <code>{location.origin}/mcp</code>
      <br />
      {workspace && (
        <span>
          Live workspace: <code>{workspace}</code>
        </span>
      )}
      <br />
      Connect an MCP client on this network. Circuit edits synchronize
      automatically; server simulations run independently.
    </div>
  )
}
