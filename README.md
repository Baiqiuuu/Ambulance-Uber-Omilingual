# Ambulance Uber

Emergency Medical Services Dispatch System

A full-stack monorepo application with web, desktop (Electron), and backend services.

## Tech Stack

- **Frontend**: Next.js 14 (TypeScript, Tailwind CSS)
- **Desktop**: Electron
- **Backend**: NestJS (TypeScript)
- **Database**: PostgreSQL (PostGIS)
- **Cache**: Redis
- **Real-time**: Socket.IO
- **Maps**: Mapbox GL
- **Package Manager**: pnpm

## Project Structure

```
ambulance-uber/
├── apps/
│   ├── @app/
│   │   ├── web/          # Next.js web application
│   │   ├── electron/     # Electron desktop app
│   │   └── server/       # NestJS backend
├── packages/              # Shared packages (future)
├── docker-compose.yml     # Database services
└── package.json           # Monorepo root
```

## Setup Instructions

### 1. Prerequisites

- Node.js 18+ (with corepack enabled)
- pnpm (via corepack: `corepack enable`)
- Docker & Docker Compose

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Environment Variables

Create `.env` files based on the examples:

**Root `.env`** (for web app):
```env
NEXT_PUBLIC_API_BASE=http://localhost:4000
NEXT_PUBLIC_WS_BASE=http://localhost:4000
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here
```

**`apps/@app/server/.env`**:
```env
PORT=4000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ems
```

### 4. Start Database Services

```bash
pnpm db:up
# or
docker compose up -d
```

### 5. Development

**Option 1: Run web and server together**
```bash
pnpm dev
```

**Option 2: Run separately**
```bash
# Terminal 1: Web app
pnpm dev:web

# Terminal 2: Backend server
pnpm dev:server

# Terminal 3: Electron (optional)
pnpm dev:electron
```

### 6. Access the Application

- **Web**: http://localhost:3000
- **Backend API**: http://localhost:4000
- **Electron**: Desktop window (loads http://localhost:3000)

## Features

- Real-time vehicle tracking via Socket.IO
- Mapbox integration for map display
- Unique dispatch constraint at database level
- Monorepo structure for code sharing
- Dockerized database services

## Available Scripts

- `pnpm dev` - Run web and server concurrently
- `pnpm dev:web` - Run Next.js web app only
- `pnpm dev:server` - Run NestJS backend only
- `pnpm dev:electron` - Run Electron desktop app
- `pnpm build` - Build all apps
- `pnpm db:up` - Start Docker services
- `pnpm db:down` - Stop Docker services

## Next Steps

- Implement Incident/Dispatch API endpoints
- Add driver mobile app (PWA)
- Implement nearest vehicle selection with distance calculation
- Add i18n support
- Add hospital/AED resource layers on map


