# MCP Lending Agent (Nebula)

A Model Context Protocol (MCP) implementation for AI powered interaction with the 1Delta lending platform. It is the agent backend behind Nebula, a DeFi yield intelligence product.

Live app: https://delta-lend-guide.vercel.app
Web app source: https://github.com/Imdavid21/delta-lend-guide
This repo: https://github.com/Imdavid21/mcp-lending (fork of 1delta-DAO/mcp-lending)

The monorepo has four packages: an MCP server that exposes the 1Delta API as tools, a multi provider AI client that runs the agent loop, a React chat frontend with wallet integration, and a Next.js web app.

## Architecture

```
Frontend (React/Vite) ──POST /chat──▶ Client (Node.js HTTP) ──stdio──▶ Backend (MCP Server)
                                             │                                  │
                                        AI Provider                       1Delta API
                                   (Anthropic / OpenAI / …)
```

```
packages/
├── backend/    # MCP Server — exposes 1Delta API as MCP tools
├── client/     # HTTP server — agentic AI loop, multi-provider bridge
└── frontend/   # Chat UI — wallet, tx executor, provider selector
```

See each package's README for details. Additional docs in [docs/](docs/).

## Setup

### Prerequisites

- Node.js ≥ 18
- pnpm (latest)
- At least one AI provider API key (see `packages/client/.env.example`)

### Install & build

```bash
pnpm install
pnpm build
```

### Configure

```bash
cp packages/client/.env.example packages/client/.env
# Fill in at least one API key
```

```bash
# packages/frontend/.env
VITE_CLIENT_URL=http://localhost:3001
```

### Run

```bash
# Start the backend (client + MCP server):
pnpm start:backend   # http://localhost:3001

# Start the frontend (separate terminal):
pnpm start:frontend  # http://localhost:3000
```

The backend is spawned automatically as a subprocess of the client.

## License

MIT
