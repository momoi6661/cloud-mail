# Cloud Mail Server

这是 Cloud Mail 的服务器版入口，和 Cloudflare Worker 版本并行存在。服务器版目前通过兼容层提供原有业务代码需要的 `db`、`kv`、`r2` 和 `domain` 环境对象，主分支的 Worker 部署文件不受影响。

## 配置邮箱域名

编辑 `server/config.local.json`：

```json
{
  "domains": ["example.com", "mail.example.com"],
  "admin": "admin@example.com",
  "jwtSecret": "生成一段足够长的随机字符串"
}
```

`domains` 会作为首次启动时的默认值注入原业务使用的 `env.domain`。服务器启动并初始化数据库后，管理员可以直接在“系统设置”页面修改域名，修改结果会保存到服务器 SQLite 数据库并立即生效；也可以用 `MAIL_DOMAINS=example.com,mail.example.com` 覆盖配置文件的初始值。

不要把真实密钥提交到 Git。`config.local.json` 和 `server/data/` 已加入忽略规则。

## 本地启动

```powershell
pnpm --dir server install
pnpm --dir mail-vue install
pnpm --dir mail-vue build
pnpm --dir server start
```

首次启动后访问 `/api/init/<jwtSecret>` 初始化数据库。服务器版默认使用 Node SQLite、服务器本地对象存储和 SQLite KV；后续可以把对象存储切换为现有的 S3 兼容配置。

## Docker 部署

```powershell
Copy-Item server/.env.example server/.env
# 编辑 server/.env，至少修改 MAIL_JWT_SECRET、MAIL_DOMAINS 和 MAIL_ADMIN
docker compose --env-file server/.env -f server/docker-compose.yml up -d --build
```

数据库文件、运行时域名和附件都会保存到 `server/data/`，该目录通过 Docker volume 持久化。容器内使用 Node SQLite，不需要额外启动 MySQL 或 PostgreSQL；如果以后改成 PostgreSQL，只需要替换数据库适配层和 Compose 服务。

启动后访问 `http://服务器地址:8787/api/init/<MAIL_JWT_SECRET>` 初始化数据库。SMTP 默认映射到宿主机 25 端口，云服务器安全组和系统防火墙也要放行 TCP 25。

## 入站邮件

服务器版默认监听 `smtpPort`（示例为 2525）接收 SMTP 邮件。生产环境把它改成 25，并在服务器防火墙和云厂商安全组放行 TCP 25；域名 MX 记录也要指向服务器。项目会把每个 SMTP 收件人交给原有 MIME 解析和入库逻辑。

系统设置里的“第三方邮箱”转发现在由服务器通过对应邮箱域名的 Resend Token 发出，原邮件正文、HTML 和附件都会保留。请先在系统设置中为发件域名填写 Resend Token，再启用转发；没有 Token 时原邮件仍会正常入库，但转发会记录失败原因。

同时保留 `POST /internal/email` 入站适配端点，适合使用外部入站邮件服务。它需要把原始 MIME 作为请求体，并通过 `X-Envelope-To` 或 `X-Original-To` 传递收件地址；如果配置了 `inboundEmailToken`，请求还需要携带 `Authorization: Bearer <token>`。
