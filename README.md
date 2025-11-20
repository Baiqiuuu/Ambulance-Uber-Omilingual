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
# 选填：覆盖默认的 CSV 数据源
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
- Unique dispatch constraint at database level
- Monorepo structure for code sharing
- Dockerized database services
- CSV 预加载与最近点查询 (`GET /api/locations/nearest`)
- 前端地图点击可查询附近语言点并展示 Top5

### 最近点 API

- **Endpoint**: `GET /api/locations/nearest?lat=<number>&lng=<number>&limit=<1-50>`
- **描述**: 返回与给定经纬度最接近的 CSV 记录，可指定最多 50 条。
- **配置**: 默认使用仓库根目录的 `languoid.csv`，也可通过 `LOCATION_CSV_PATH` 指向其他大体量 CSV。
- **响应示例**:
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

### 前端临近点交互

- 在 web 地图界面点击任意位置将触发最近点查询，并在右上角侧边栏展示最接近的 5 个语言点（含距离）。
- 侧边栏会动态显示加载状态和错误信息，并在地图上以蓝色标记突出当前位置与返回的语言点。

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


