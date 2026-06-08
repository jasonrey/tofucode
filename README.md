# tofucode

Companion web UI for **Claude Code Remote Control**. Run it on the VM where your `claude` sessions live and use it to start, monitor, search, and browse sessions from any device — then do the actual work in the Claude native app via Remote Control.

## Why v2

Claude now has a native remote story: the desktop app connects over SSH, and the mobile app attaches to any running `claude` session via Remote Control (`claude --rc`). But the native apps still can't:

1. **Start a session on the VM** — RC only attaches to *already-running* sessions, and mobile has no SSH
2. **Show SDK/cron session history** — automation sessions are hidden from the native resume picker
3. **Search across sessions** — no cross-project full-text search
4. **Create projects** — no folder creation/browsing

tofucode v2 does exactly these four things, and nothing else.

> **What happened to v1?** tofucode ≤ 1.5.0 was a full web chat UI over the Claude Agent SDK — prompt execution, terminal, file editor, git, MCP, Notion, Discord. It predates Claude's native remote support, which made that approach obsolete (and SDK-driven usage now bills against credits rather than subscription quota). v2 is a ground-up refocus; v1.5.0 remains on npm if you need the old behaviour.

---

## How it works

```
┌─ your phone / laptop ─────────────┐
│  Claude app  ←─ remote control ─→ │ ─┐
│  tofucode UI ←─── https/wss ────→ │ ─┼─→ ┌─ VM ──────────────────────┐
└───────────────────────────────────┘  │   │  claude --rc  (session A) │
                                       └─→ │  claude --rc  (session B) │
                                           │  tofucode server          │
                                           └───────────────────────────┘
```

- tofucode spawns `claude` processes under a PTY with remote control enabled
- Each live session gets a `https://claude.ai/code/session_…` URL — tap it to open the session in the Claude app
- Session history (JSONL under `~/.claude/projects/`) is browsable and searchable, including sessions the native app hides

---

## Quick Start

```bash
# Run directly with npx
npx tofucode

# Or install globally
npm install -g tofucode
tofucode
```

Open http://localhost:3000, set a password, and you're in.

### Prerequisites

- **Node.js 18+**
- **Claude Code** (`claude` CLI) installed and authenticated on the same machine
- **Remote control at startup** enabled, so every session registers for RC:

```json
// ~/.claude/settings.json
{
  "remoteControlAtStartup": true
}
```

- A claude.ai subscription (Pro/Max/Team/Enterprise) with OAuth login — Remote Control does not work with API-key auth

---

## Features

### Session launcher
- Start a new `claude` session in any project folder — from your phone
- Resume existing sessions (with consent prompt if history is missing)
- Stop sessions safely (PID identity is validated before kill — no killing recycled PIDs)
- Live status: busy/idle, remote connected, PID, claude.ai URL

### Session browser
- Sessions grouped by project in the sidebar (Recent tab), or a flat list of running sessions (Live tab)
- Full read-only history view with tool calls, compaction summaries, and pagination
- Session titles (rename inline), session deletion
- SDK/cron/automation sessions visible — the ones the native app hides

### Search
- `Ctrl+K` — full-text search across every session in every project, with match snippets

### Projects
- Folder browser as the landing page — open any folder's session list
- Create new project folders from the UI

### Platform
- Password auth (argon2, rate-limited), PWA installable, auto-update notifications
- Live status polls every 10s so the UI tracks session readiness without refresh

### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd+K` | Search sessions |
| `Ctrl/Cmd+B` | Toggle sidebar |
| `Ctrl/Cmd+,` | Settings |

---

## Usage

```bash
# Start server (default command)
tofucode
tofucode start

# Custom port and host
tofucode start -p 8080 -h 127.0.0.1

# Run as daemon
tofucode start -d

# Lifecycle management
tofucode stop
tofucode restart
tofucode status

# Restrict browsing to a specific directory
tofucode start --root /path/to/projects

# See all options
tofucode --help
```

### Configuration

Priority order: CLI arguments → config file (`--config prod.json`) → environment variables.

| Setting | CLI | Config | Env Var |
|---------|-----|--------|---------|
| Port | `-p 3000` | `"port": 3000` | `PORT=3000` |
| Host | `-h 0.0.0.0` | `"host": "0.0.0.0"` | `HOST=0.0.0.0` |
| No auth | `--no-auth` | `"auth": false` | `AUTH_DISABLED=true` |
| Daemon | `-d` | `"daemon": true` | - |
| Debug | `--debug` | `"debug": true` | `DEBUG=true` |
| Log file | `--log-file <path>` | `"logFile": "<path>"` | `LOG_FILE=<path>` |
| Root path | `--root <path>` | `"root": "<path>"` | `ROOT_PATH=<path>` |
| Login attempts | - | - | `MAX_LOGIN_ATTEMPTS=3` |
| Lockout window | - | - | `LOGIN_WINDOW_MS=900000` |
| Disable update check | - | - | `DISABLE_UPDATE_CHECK=true` |

### Root path restriction

`--root` limits folder browsing and project/session listings to a directory subtree. It is **best-effort** — the spawned `claude` sessions themselves have whatever access your user has. For real isolation, run in Docker.

---

## Security

- **Authentication enabled by default** — password set on first run, argon2-hashed, cookie sessions
- **Login rate limiting** — 3 attempts, 15-min lockout (configurable)
- Spawned sessions run as your user with `--dangerously-skip-permissions` by default — treat the UI password as the keys to the VM, and put it behind HTTPS (reverse proxy) for remote access
- Auth data in `~/.tofucode/`, session data in `~/.claude/projects/`

### Security Reports

Independent assessments before each release, in [`docs/`](./docs):

- **[v1.5.0 Security Report](./docs/security_report_v1.5.0.md)** — last v1 release
- Older reports: v1.0.3 – v1.4.0 in the same folder

---

## Contributing

```bash
git clone <repo-url>
cd tofucode
npm install
npm run dev      # backend (nodemon, manual restart: rs + Enter) + Vite
npm run check    # Biome lint + format
npm run build    # production frontend build
```

- **[CLAUDE.md](./CLAUDE.md)** — architecture, key concepts, development workflow
- **[docs/backend-spec-v2.md](./docs/backend-spec-v2.md)** — WebSocket event reference
- **[CHANGELOG.md](./CHANGELOG.md)** — release notes

---

## License

MIT
