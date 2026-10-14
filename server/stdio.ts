// Forward stdio to the one authoritative HTTP service, so both transports
// share live browsers and cannot overwrite each other's persistence files.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
const transport = new StdioServerTransport()
const endpoint = process.env.OHMLET_MCP_URL || 'http://127.0.0.1:5174/mcp'
let protocolVersion = '2025-11-25'
let closed = false
const shutdown = new AbortController()
transport.onclose = () => {
  closed = true
  shutdown.abort()
}
transport.onmessage = async (message) => {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': protocolVersion,
        ...(process.env.OHMLET_MCP_TOKEN
          ? { authorization: 'Bearer ' + process.env.OHMLET_MCP_TOKEN }
          : {}),
      },
      body: JSON.stringify(message),
      signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(300000)]),
    })
    if (!response.ok)
      throw Error(
        'MCP HTTP service returned ' +
          response.status +
          '. Ensure ohmlet-mcp is running and credentials are configured.',
      )
    if (response.status === 202) return
    const result = await response.json()
    if (result.result?.protocolVersion)
      protocolVersion = result.result.protocolVersion
    if (!closed) await transport.send(result)
  } catch (e: any) {
    if (closed) return
    if ('id' in message)
      await transport.send({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32603, message: e.message },
      })
    else console.error(e.message)
  }
}
transport.onerror = (e) => console.error(e.message)
await transport.start()
