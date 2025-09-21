# Perform3D MCP Server (Windows)

This package hosts the Node.js backend and C# worker described in the documentation bundle. It exposes

- a REST API (Express) with endpoints such as `/api/project/open`, `/api/model/add-nodes`, `/api/analysis/run-series`, `/api/results/*`
- a Streamable HTTP MCP endpoint (`POST/GET/DELETE /mcp`) with tools mirroring the workflow described in `MCP_TOOLS_SPEC.md`
- structured logging (pino) and an in-memory log buffer readable via `GET /api/logs/recent`
- Server-Sent Events for progress updates (`GET /api/progress/:token`) and forwarding of progress notifications to MCP sessions

## Prerequisites

- Node.js 20+
- .NET 8 SDK (for building the worker)
- Perform3D v10 installed on the same machine (the stub worker currently simulates calls; replace with real COM integration later)

## Install & Build

```powershell
# from repo root
cd src/perform3d
npm install
npm run build

# build the worker (outputs Perform3D.Worker.exe into ./worker)
dotnet publish worker/Perform3D.Worker.csproj -c Release -r win-x64 --self-contained false -o worker
```

By default the Node server looks for `worker/Perform3D.Worker.exe`. Override via the `worker` section in `config/local.json` or the `P3D_MCP_CONFIG` environment variable if you want to run `dotnet run` or place the binary elsewhere.

## Development

```powershell
# run TypeScript in watch mode (uses tsx)
npm run dev
```

The dev script expects the worker path to resolve. During early development you can run the worker manually:

```powershell
$env:P3D_MCP_CONFIG = '{"worker":{"command":"dotnet","args":["run","--project","worker/Perform3D.Worker.csproj"]}}'
npm run dev
```

## REST Surface (excerpt)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/project/connect` | Start or attach to Perform3D |
| POST | `/api/project/open` | Open existing model |
| POST | `/api/model/add-nodes` | Add nodes with mass/restraints |
| POST | `/api/analysis/run-series` | Run analysis, returns `progressToken` |
| GET  | `/api/progress/:token` | Stream progress via SSE |
| GET  | `/api/logs/recent` | Inspect structured logs |

All REST endpoints forward to the worker via the IPC contract in `IPC_BRIDGE_SPEC.md`. Errors are categorized into `IO`, `MODEL_STATE`, `COM_ERROR`, or `UNKNOWN` and surfaced with JSON payloads.

## MCP Usage

The MCP tools exposed under `/mcp` correspond 1:1 with the documented workflow (`connect`, `openModel`, `addNodes`, `runSeries`, `getResults.*`, etc.). The server uses `StreamableHTTPServerTransport` so clients can resume sessions and receive progress notifications.

## Logging & Progress

- Logs are emitted via pino (JSON) and mirrored in memory for quick inspection (`GET /api/logs/recent`).
- Worker `progress` events are forwarded to:
  - SSE subscribers (REST)
  - MCP clients via `notifications/progress`

## Next Steps

The current C# worker is a stub that simulates Perform3D replies. Replace `HandleCommand` with real COM/.NET API calls as you continue implementation. Use the typed IPC contract and structured logging already in place to keep observability consistent with the PRD.
