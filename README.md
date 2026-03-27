# EmbyHub

轻量级 Emby 反向代理管理面板。单文件 Go 后端 + 嵌入式 SPA 前端，开箱即用。

<p align="center">
  <img src="docs/dashboard.png" width="800" alt="仪表盘">
</p>

## 这是什么

EmbyHub 是一个专为 Emby 媒体服务器设计的反向代理管理面板。它解决的核心问题是：**当你需要在一台机器上管理多个 Emby 反代站点时，不想手写 Nginx 配置，不想逐个维护 UA 伪装规则，也不想自己实现流量计量和限速。**

EmbyHub 把这些事情打包成一个单二进制程序，带管理界面，带实时监控，开箱可用。

## 核心特性

- **多站点反代管理** — 每个站点独立监听端口，独立配置上游地址
- **双上游分流** — 网页/API 和播放/转码流量可以分别指向不同的上游服务器
- **UA 伪装** — 3 种预设（Infuse / Web / 客户端），HTTP 和 WebSocket 请求头统一改写
- **流量计量与管控** — 按站点统计流量、设置限速、设置流量配额
- **WebSocket 代理** — 完整支持 Emby 的 WebSocket 通信
- **SSE 实时推送** — 仪表盘数据通过 Server-Sent Events 实时更新
- **故障诊断** — 回源健康检测、上游 TLS 证书检查、请求头配置预览
- **JWT 认证** — 管理面板使用 JWT Bearer Token 认证，密码 bcrypt 存储
- **单二进制部署** — 前端静态资源嵌入 Go 二进制，SQLite 做持久化，无外部依赖

## 技术架构

```
┌─────────────────────────────────────────────┐
│                  EmbyHub                     │
│                                              │
│  ┌──────────┐   ┌──────────────────────────┐ │
│  │ 管理面板  │   │     反代引擎 (per-site)   │ │
│  │ :9090    │   │  :8001  :8002  :800N     │ │
│  │          │   │                          │ │
│  │ REST API │   │  HTTP ──► target_url     │ │
│  │ SSE 推送 │   │  WS   ──► target_url     │ │
│  │ 静态文件  │   │  播放  ──► playback_url   │ │
│  └──────────┘   └──────────────────────────┘ │
│       │                     │                │
│  ┌──────────────────────────────────────┐    │
│  │            SQLite (嵌入式)            │    │
│  └──────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

- **后端**：单文件 Go（`main.go`），使用标准库 `net/http`
- **前端**：原生 HTML/CSS/JS SPA，hash 路由，通过 `embed.FS` 嵌入二进制
- **数据库**：`modernc.org/sqlite`（纯 Go SQLite 实现，无 CGO 依赖）
- **认证**：自实现 HMAC-SHA256 JWT，无第三方 JWT 库

## 项目结构

```
emby-panel/
├── main.go              # 全部后端逻辑（API、反代引擎、诊断、认证）
├── main_test.go          # 测试
├── web/
│   ├── embed.go          # Go embed 入口
│   └── static/
│       ├── index.html    # SPA 入口
│       ├── css/          # 样式
│       └── js/           # 前端逻辑（按页面拆分）
├── Dockerfile            # 多阶段构建
├── go.mod / go.sum
└── .github/workflows/
    └── release.yml       # CI：多平台构建 + Docker 推送 + GitHub Release
```

## 快速开始

### 从源码构建

```bash
git clone https://github.com/EmbyHub/emby-panel.git
cd emby-panel
go build -o emby-panel .
./emby-panel
```

默认监听 `http://localhost:9090`，首次访问会引导设置管理员密码。

### 命令行参数

```bash
./emby-panel                          # 默认 :9090，数据库在当前目录
./emby-panel --port 8080              # 自定义端口
./emby-panel --db /data/emby-panel.db # 自定义数据库路径
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `9090` | 管理面板监听端口 |
| `DB_PATH` | `emby-panel.db` | SQLite 数据库路径 |
| `JWT_SECRET` | 进程启动时随机生成 | JWT 签名密钥。**生产环境必须显式设置**，否则每次重启后已有登录会话全部失效 |

## Docker 部署

### 使用预构建镜像

```bash
docker run -d \
  --name embyhub \
  -p 9090:9090 \
  -p 8001-8010:8001-8010 \
  -v embyhub-data:/app/data \
  -e JWT_SECRET=your-secret-here \
  ghcr.io/embyhub/emby-panel:latest
```

### 自行构建

```bash
docker build -t embyhub .
docker run -d \
  --name embyhub \
  -p 9090:9090 \
  -p 8001-8010:8001-8010 \
  -v embyhub-data:/app/data \
  -e JWT_SECRET=your-secret-here \
  embyhub
```

> **注意**：除管理面板端口外，还需要映射每个反代站点的监听端口。上面的 `8001-8010` 只是示例，按实际配置调整。

### Docker Compose 示例

```yaml
services:
  embyhub:
    image: ghcr.io/embyhub/emby-panel:latest
    restart: unless-stopped
    ports:
      - "9090:9090"
      - "8001-8010:8001-8010"
    volumes:
      - embyhub-data:/app/data
    environment:
      - JWT_SECRET=your-secret-here

volumes:
  embyhub-data:
```

## 双上游配置

每个站点可以配置两个上游地址：

| 字段 | 用途 | 示例 |
| --- | --- | --- |
| **回源地址**（`target_url`） | 网页、API、元数据请求 | `https://emby.example.com` |
| **播放地址**（`playback_target_url`） | 视频/音频播放、转码、直链下载 | `https://cdn.example.com` |

播放地址为可选项。如果不设置，所有请求走同一个上游。

设置了播放地址后，以下路径前缀的请求会被路由到播放上游：

- `/Videos/...`、`/emby/Videos/...`
- `/Audio/...`、`/emby/Audio/...`
- `/LiveTV/...`、`/emby/LiveTV/...`
- `/Items/.../Download`

**典型场景**：Emby 主服务器负责 API 和元数据，CDN 或专用媒体服务器负责大文件分发。

## 诊断功能说明

诊断页面提供四项检测，需要理解每项的含义和边界：

### 回源健康

- 检测的是上游 `target_url` 的**可达性**
- 会尝试多个探针路径（不仅仅是 `/emby/System/Info/Public`）
- 上游返回 `401`、`403`、`404` 时仍判定为"在线" — 因为能收到 HTTP 响应说明服务器可达，只是该路径需要认证或不存在
- 仅当上游完全不可达或返回 `5xx` 时才报"异常"或"离线"
- **这不是端到端的业务健康证明**，只代表网络层面的可达性判定

### TLS 状态

- 检测的是**上游 `target_url`** 的 HTTPS 证书，不是管理面板自身的证书
- 如果上游是 HTTP，会显示"未启用"
- 只做证书读取和有效期展示，**不负责自动签发或续期**

### 请求头配置

- 显示的是 EmbyHub **即将发送给上游**的 UA 和 Client 字段值
- 这是本地配置预览，**不是远端服务器的回显验证**
- UA 伪装会同时改写 HTTP 和 WebSocket 请求中的 `User-Agent` 头以及 `X-Emby-Authorization` / `Authorization` 中的 `Client="..."` 字段

### 代理状态

- 显示当前站点的反代进程是否在运行、监听在哪个端口

## 运维要点

- **JWT 密钥**：未设置 `JWT_SECRET` 时，程序每次启动会生成一个随机密钥。这意味着重启后所有会话失效，生产环境务必显式配置
- **流量持久化**：流量数据每 60 秒刷入 SQLite，异常退出可能丢失最近一分钟的计量数据
- **站点操作原子性**：站点创建、启停、更新操作如果反代绑定失败，会回滚数据库变更并返回错误
- **优雅关闭**：收到 `SIGINT`/`SIGTERM` 后会先 flush 流量再退出

## 验证

```bash
go test ./...        # 运行测试
go build -o emby-panel .  # 编译
```

## CI/CD

推送 `v*` 标签时自动触发：

- 多平台构建：`linux/amd64`、`linux/arm64`、`windows/amd64`、`darwin/arm64`
- 创建 GitHub Release 并上传二进制
- 构建并推送 Docker 镜像到 `ghcr.io`

## 截图

<details>
<summary>站点管理</summary>
<img src="docs/sites.png" width="800" alt="站点管理">
</details>

<details>
<summary>故障诊断</summary>
<img src="docs/diagnostics.png" width="800" alt="故障诊断">
</details>

## Roadmap

以下功能尚未实现，列在这里作为未来方向：

- [ ] 多用户 + 角色权限
- [ ] 审计日志
- [ ] Telegram / Webhook 通知

## 限制与注意事项

- 当前只支持单管理员，不支持多用户或角色划分
- 没有审计日志，操作不可追溯
- 没有内置通知能力（无 Telegram / Webhook 集成）
- TLS 诊断是只读展示，不管证书签发和续期
- UA 诊断是本地配置预览，不验证远端实际收到的请求头
- 后端逻辑集中在 `main.go`，这是有意为之的设计选择

## 开发须知

- 后端代码保持在 `main.go`，不拆分文件
- 前端使用 hash 路由（`#/dashboard`、`#/sites`、`#/diagnostics`）
- API 认证使用 JWT Bearer Token
- SQLite 驱动名为 `sqlite`（不是 `sqlite3`）
- 静态资源通过 `go:embed` 嵌入二进制

## 参与贡献

请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 安全问题

请参阅 [SECURITY.md](SECURITY.md)。

## License

MIT
