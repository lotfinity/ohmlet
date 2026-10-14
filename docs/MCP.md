# Ohmlet MCP
Endpoint: https://acer-gnmd.merino-ayu.ts.net/mcp (Streamable HTTP, stateless POST).
Runs on Acer, loopback port 5174, through the existing workbench proxy.
The endpoint is private to clients that can reach this Tailnet URL. ChatGPT cloud does not automatically gain access to a private Tailnet endpoint.

## Connect
Remote client configuration:
```json
{"mcpServers":{"ohmlet":{"url":"https://acer-gnmd.merino-ayu.ts.net/mcp"}}}
```
Configuration syntax depends on the client. Local stdio (the HTTP service must be running; this bridge shares its authoritative state):
```json
{"mcpServers":{"ohmlet":{"command":"node","args":["server/dist/stdio.js"],"cwd":"/home/lofa/Projects/ohmlet"}}}
```

## Workflow
Read workspaces_list; select the connected browser-* workspace for live edits or main for headless design. Read current revision. Fetch catalog_search/catalog_detail for exact parts. Use workspace_edit or workspace_replace with expectedRevision. Validate, inspect connectivity, simulate with endpoint traces, and verify observable expectations. For new generated circuits, circuit_verify_apply verifies the proposed layout before publishing and leaves the current circuit unchanged on failure. Repair failures using measured results. Browser changes poll every 1.5s and are persisted locally and on server. The first visit creates a distinct browser workspace from its existing circuit. API keys are never included. On a simultaneous edit, the server revision wins; previous browser edits remain in browser undo history. Keep one active browser tab per browser workspace (duplicated tabs share localStorage).

MCP exposes 20 tools, three resource types and two prompts. simulation_sweep compares parameter values without modifying the circuit. Browser state includes live telemetry and command acknowledgements. tools/list is authoritative. Prompt payloads are short workflow instructions plus the user's request; detailed catalog and state are retrieved on demand. design_context explicitly returns the legacy full system prompt/schema when wanted. There is no second paid model embedded in the server and no automatic forwarding of browser API credentials.

Simulations start from circuit initial conditions each call; seconds is total duration, not incremental. Results include the exact revision simulated, final telemetry, issues, voltages and optional trace. Worker jobs have 30s wall-time and 192MB heap limits; maximum two concurrent jobs. Inactive workspaces can be deleted with workspace_delete. Disk-write failures leave the in-memory revision unchanged. Layout limits: 150 components, 600 wires; 1MB HTTP body; undo history 30. Simulation: at most 8s, 200000 steps, 1000 samples and 32 endpoint traces. Verification uses the existing shared health and expectation checks. FireBeetle GPIO/PWM/ADC are behavioral models; firmware CPU, networking and physical flashing are not implemented.

## Run / development
```sh
npm run mcp:build
npm run mcp:start
# In another terminal:
npm run dev
```
Vite forwards /mcp and /api/mcp to loopback:5174.
MCP data defaults to ~/.local/share/ohmlet-mcp/workspaces.json, written atomically with mode 0600. OHMLET_DATA_DIR overrides it. OHMLET_MCP_PORT defaults to 5174. The stdio bridge uses OHMLET_MCP_URL (default http://127.0.0.1:5174/mcp) and the same optional bearer token. OHMLET_ROOT selects the repository for examples. OHMLET_ALLOWED_HOSTS adds comma-separated hostnames. Host and Origin checks reject untrusted browser origins. Only the configured workbench origins are allowed, including the HTTPS Tailnet origin when its reverse proxy rewrites the backend Host. OHMLET_ALLOWED_ORIGINS adds exact comma-separated origins. Optional OHMLET_MCP_TOKEN protects /mcp with Bearer auth; browser sync remains same-origin under Tailnet access. No permissive CORS is enabled. Do not publish the private endpoint publicly without adding appropriate access control.

Service install (from repo):
```sh
mkdir -p ~/.config/systemd/user
cp server/ohmlet-mcp.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now ohmlet-mcp
```
