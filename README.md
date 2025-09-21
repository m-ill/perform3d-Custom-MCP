# Perform3D MCP Server (Windows)

Automation bridge for CSI Perform3D v10 structural analysis software, providing programmatic access via REST API and Model Context Protocol (MCP).

## Features

- **REST API** - Express server with endpoints for model creation, analysis, and results retrieval
- **MCP Interface** - Streamable HTTP transport supporting tool-based workflows
- **COM Integration** - Direct connection to Perform3D via COM automation (Windows only)
- **Progress Tracking** - Real-time analysis progress via Server-Sent Events
- **Validation** - Input validation with Zod schemas for all commands
- **Structured Logging** - JSON logging with pino and in-memory buffer

## Prerequisites

### Required Software
- **Windows OS** (Windows 10/11 or Server 2019+)
- **Perform3D v10** - Licensed installation from CSI
- **Node.js 20+** - For running the server
- **.NET 8 SDK** - For building the C# worker
- **Administrator privileges** - For COM registration (first run only)

### System Requirements
- Minimum 8GB RAM (16GB+ recommended for large models)
- SSD storage for work directories
- x86 architecture support (Perform3D is 32-bit)

## Installation

### 1. Clone and Install Dependencies

```powershell
# Clone repository
git clone <repository-url>
cd perform3d-mcp/src/perform3d

# Install Node dependencies
npm install

# Build TypeScript
npm run build
```

### 2. Build C# Worker

```powershell
# Build worker executable (outputs to ./worker directory)
dotnet publish worker/Perform3D.Worker.csproj -c Release -r win-x86 --self-contained false -o worker

# Verify build
dir worker/Perform3D.Worker.exe
```

### 3. Configure Settings

Edit `config/default.json` to match your environment:

```json
{
  "perform3d": {
    "installPath": "C:/Program Files/Computers and Structures/Perform-3D 10",
    "visible": false,
    "maxInstances": 1
  },
  "paths": {
    "templates": "C:/p3d-mcp/templates",
    "work": "C:/p3d-mcp/work",
    "exports": "C:/p3d-mcp/exports",
    "logs": "C:/p3d-mcp/logs"
  },
  "server": {
    "host": "127.0.0.1",
    "port": 8732
  }
}
```

Create a `config/local.json` for environment-specific overrides (gitignored).

### 4. Verify COM Registration

Perform3D must be registered as a COM server. This typically happens during installation, but can be verified:

```powershell
# Check if Perform3D COM is registered
reg query "HKCR\Perform3Dv1.Application"

# If not found, register manually (run as Administrator)
cd "C:\Program Files\Computers and Structures\Perform-3D 10"
regsvr32 Perform3Dv1.dll
```

## Usage

### Starting the Server

```powershell
# Production mode
npm start

# Development mode (with auto-reload)
npm run dev

# With environment overrides
$env:P3D_MCP_CONFIG = '{"server":{"port":9000}}'
npm start
```

### REST API Examples

```bash
# Connect to Perform3D
curl -X POST http://localhost:8732/api/project/connect

# Open a model
curl -X POST http://localhost:8732/api/project/open \
  -H "Content-Type: application/json" \
  -d '{"path": "C:/models/example.p3d"}'

# Add nodes
curl -X POST http://localhost:8732/api/model/add-nodes \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"id": 1, "x": 0, "y": 0, "z": 0},
      {"id": 2, "x": 100, "y": 0, "z": 0}
    ]
  }'

# Run analysis
curl -X POST http://localhost:8732/api/analysis/run-series \
  -H "Content-Type: application/json" \
  -d '{"name": "Pushover_X"}'

# Get results
curl "http://localhost:8732/api/results/nodeDisp?nodeId=1&series=Pushover_X"
```

### MCP Client Usage

```javascript
// Example using MCP SDK
import { Client } from '@modelcontextprotocol/sdk';

const client = new Client({
  endpoint: 'http://localhost:8732/mcp'
});

// Connect to Perform3D
await client.callTool('connect', {});

// Open model
await client.callTool('openModel', {
  path: 'C:/models/example.p3d'
});

// Run analysis with progress tracking
const result = await client.callTool('runSeries', {
  name: 'Pushover_X',
  _meta: { progressToken: 'analysis-1' }
});
```

## API Reference

### Core Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/project/connect` | Initialize Perform3D connection |
| POST | `/api/project/open` | Open existing model file |
| POST | `/api/project/new-from-template` | Create model from template |
| POST | `/api/project/save` | Save current model |
| POST | `/api/project/close` | Close current model |
| POST | `/api/model/set-info` | Set model properties and units |
| POST | `/api/model/add-nodes` | Add structural nodes |
| POST | `/api/model/add-elements` | Add structural elements |
| POST | `/api/component/add-material` | Define material properties |
| POST | `/api/component/add-cross-section` | Define cross sections |
| POST | `/api/analysis/run-series` | Execute analysis series |
| GET  | `/api/results/*` | Retrieve analysis results |
| GET  | `/api/progress/:token` | Stream progress updates (SSE) |
| GET  | `/api/logs/recent` | View recent log entries |

### MCP Tools

See `perform3d-mcp-docs/MCP_TOOLS_SPEC.md` for complete tool documentation.

## Development

### Project Structure

```
src/perform3d/
├── config/           # Configuration files
├── src/              # TypeScript source
│   ├── http/         # REST API handlers
│   ├── mcp/          # MCP implementation
│   ├── worker/       # Worker bridge
│   └── schemas.ts    # Zod validation schemas
├── worker/           # C# worker source
│   ├── Program.cs
│   ├── Perform3DSession.cs
│   ├── CommandDispatcher.cs
│   └── ResultMapper.cs
└── test/            # Integration tests
```

### Running Tests

```powershell
# Unit tests
npm test

# Integration test (requires Perform3D)
npm run test:integration

# Manual test script
powershell test/integration.ps1
```

### Debugging

Enable debug logging:

```powershell
$env:LOG_LEVEL = "debug"
npm run dev
```

Monitor worker output:
```powershell
# Worker logs are forwarded to Node server
curl http://localhost:8732/api/logs/recent | jq
```

## Troubleshooting

### Common Issues

1. **"Perform3D COM server not registered"**
   - Run Perform3D installer repair
   - Register manually with `regsvr32` (see Installation)

2. **"Failed to create Perform3D instance"**
   - Check Perform3D license
   - Verify no other instances running
   - Ensure running on same user account as installation

3. **"Model check failed"**
   - Validate model consistency in Perform3D GUI
   - Check units consistency
   - Verify all required components defined

4. **Worker crashes or hangs**
   - Check Windows Event Viewer for COM errors
   - Increase `startupTimeout` in config
   - Enable `visible: true` to see Perform3D UI

### Performance Optimization

- Keep models under 50,000 nodes for optimal performance
- Use SSDs for work directories
- Increase worker `healthCheckInterval` for long analyses
- Consider running multiple instances on separate ports

## Security Considerations

- Server binds to localhost by default
- No built-in authentication (add reverse proxy for production)
- File paths are validated but use absolute paths
- COM runs in same security context as server

## License

See LICENSE file in repository root.

## Support

- GitHub Issues: [Report bugs and feature requests]
- Documentation: See `perform3d-mcp-docs/` directory
- Perform3D Support: Contact CSI for software-specific issues