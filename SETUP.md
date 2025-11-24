# Quick Setup Guide

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment Variables

**Create root `.env` file:**
```env
NEXT_PUBLIC_API_BASE=http://localhost:4000
NEXT_PUBLIC_WS_BASE=http://localhost:4000
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here
```

**Create `apps/@app/server/.env` file:**
```env
PORT=4000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ems
```

### 3. Start Database Services

```bash
pnpm db:up
```

### 4. Start Development Servers

**Option 1: Run web and server together**
```bash
pnpm dev
```

**Option 2: Run separately**
```bash
# Terminal 1
pnpm dev:web

# Terminal 2  
pnpm dev:server

# Terminal 3 (optional)
pnpm dev:electron
```

### 5. Access the Application

- Web: http://localhost:3000
- API: http://localhost:4000
- Electron: Desktop window will open automatically

## Verification

Open your browser and visit http://localhost:3000, you should see:
- Map display (requires valid Mapbox token)
- "🚑 A1" marker appearing/moving every 2 seconds (simulated real-time position)

## Troubleshooting

1. **Port already in use**: Modify the port number in `.env` file
2. **Database connection failed**: Ensure Docker services are running (`docker ps`)
3. **Mapbox map not displaying**: Check if `NEXT_PUBLIC_MAPBOX_TOKEN` is correctly set


