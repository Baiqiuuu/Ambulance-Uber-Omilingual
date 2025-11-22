# Quick Setup Guide

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

**创建根目录 `.env` 文件：**
```env
NEXT_PUBLIC_API_BASE=http://localhost:4000
NEXT_PUBLIC_WS_BASE=http://localhost:4000
NEXT_PUBLIC_MAPBOX_TOKEN=你的Mapbox token
```

**创建 `apps/@app/server/.env` 文件：**
```env
PORT=4000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ems
```

### 3. 启动数据库

```bash
pnpm db:up
```

### 4. 启动开发服务器

**方式一：同时启动 Web 和 Server**
```bash
pnpm dev
```

**方式二：分别启动**
```bash
# 终端 1
pnpm dev:web

# 终端 2  
pnpm dev:server

# 终端 3 (可选)
pnpm dev:electron
```

### 5. 访问应用

- Web: http://localhost:3000
- API: http://localhost:4000
- Electron: 会自动打开桌面窗口

## 验证

打开浏览器访问 http://localhost:3000，你应该能看到：
- 地图显示（需要有效的 Mapbox token）
- 每 2 秒出现/移动的 "🚑 A1" 标记（模拟实时位置）

## 故障排除

1. **端口被占用**：修改 `.env` 中的端口号
2. **数据库连接失败**：确保 Docker 服务正在运行 (`docker ps`)
3. **Mapbox 地图不显示**：检查 `NEXT_PUBLIC_MAPBOX_TOKEN` 是否正确设置





