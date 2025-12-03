# Ambulance Uber

Emergency Medical Services Dispatch System

A full-stack monorepo application with web, desktop (Electron), and backend services.

## Demo Video
https://dropover.cloud/3b5ba5

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
OPENAI_API_KEY=your_openai_api_key_here
```

**`apps/@app/server/.env`**:
```env
PORT=4000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ems
# Optional: Override default CSV data source
LOCATION_CSV_PATH=/absolute/path/to/languoid.csv
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
- AI-powered language detection using OpenAI Whisper API
- Unique dispatch constraint at database level
- Monorepo structure for code sharing
- Dockerized database services
- CSV preloading with nearest point query (`GET /api/locations/nearest`)
- Frontend map click to query nearby language points and display Top 5

### Nearest Point API

- **Endpoint**: `GET /api/locations/nearest?lat=<number>&lng=<number>&limit=<1-50>`
- **Description**: Returns CSV records closest to the given latitude and longitude, with a maximum of 50 records.
- **Configuration**: By default uses `languoid.csv` in the repository root, or can be overridden via `LOCATION_CSV_PATH` to point to other large CSV files.
- **Response Example**:
  ```json
  {
    "data": [
      {
        "id": "alpha",
        "name": "Alpha",
        "latitude": 1,
        "longitude": 1,
        "distanceMeters": 123
      }
    ],
    "meta": {
      "totalIndexed": 27000,
      "source": "/data/languoid.csv"
    }
  }
  ```

### Frontend Nearest Point Interaction

- Clicking anywhere on the web map interface will trigger a nearest point query, displaying the 5 closest language points (with distance) in the top-right sidebar.
- The sidebar dynamically shows loading status and error messages, and highlights the current position and returned language points with blue markers on the map.

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





