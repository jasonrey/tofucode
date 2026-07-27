# tofucode v2

Companion web UI for **Claude Code Remote Control**. Runs on the same VM as your `claude` sessions and fills the gaps the native Claude apps leave open:

1. **Start/stop RC sessions** on the VM from anywhere (mobile has no SSH; RC can only attach to already-running sessions)
2. **Browse session history** — including SDK/cron/automation sessions the native app intentionally hides
3. **Cross-session full-text search** across all projects
4. **Create projects** (folders) and start sessions in them

It does **not** execute prompts itself — interaction happens in the Claude native app (or terminal) via the `https://claude.ai/code/{bridgeSessionId}` remote URL. tofucode is the launcher, browser, and search index.

## v1.5 → v2

v1 (through v1.5.0, the last published release) was a full web chat UI over the Claude Agent SDK — prompt execution, terminal, file browser/editor, git, MCP manager, Notion tasks/notes, Discord bot. It existed because Claude had no native mobile/remote story.

That changed: the Claude desktop app gained SSH environments, the mobile app gained Remote Control (`claude --rc`), and SDK-driven usage moved to credit billing while the interactive REPL stays on subscription quota. v1's chat/execution path became obsolete, so v2 stripped everything except the four gaps above. The Agent SDK dependency, Discord bot, terminal, files, git, MCP, and Notion features were all deleted (~39k lines). v1.5.0 remains tagged and on npm for reference.

## Tech Stack

- **Frontend**: Vue 3 + Vite + Vue Router (history mode)
- **Backend**: Express 5 + REST HTTP API (`/api/v2`)
- **RC spawning**: tmux (`claude` is an interactive REPL — it exits on detached spawn without a PTY; a detached tmux window supplies one)

## Project Structure

```
tofucode/
├── server/
│   ├── index.js             # Express entry: auth API, static dist serving
│   ├── config.js            # Config + pathToSlug/slugToPath utilities
│   ├── lib/
│   │   ├── api-auth.js          # requireAuth Express middleware (cookie-based)
│   │   ├── session-registry.js  # Read-only view of ~/.claude/sessions/{pid}.json
│   │   ├── rc-launcher.js       # Idempotent spawn/stop of claude --rc via tmux
│   │   ├── session-search.js    # Streaming JSONL full-text search
│   │   ├── sessions.js          # JSONL parsing, history pagination
│   │   ├── recent-sessions.js   # Cross-project recent sessions scan
│   │   └── auth.js, projects.js, folders.js, ...
│   └── routes/
│       ├── upload.js
│       └── v2/              # REST API routes (see docs/http-api-v2.md)
├── src/
│   ├── views/
│   │   ├── FolderView.vue       # Tab 1 (/) — folder browser + create
│   │   ├── RecentView.vue       # Tab 2 (/recent) — sessions grouped by folder
│   │   ├── LiveView.vue         # Tab 3 (/live) — running sessions + stop
│   │   ├── SettingsView.vue     # Tab 4 (/settings) — metadata + app/auth actions
│   │   ├── SessionsView.vue     # /project/:slug — session list + RC controls + delete
│   │   ├── ChatView.vue         # /project/:slug/session/:id — read-only history + session panel
│   │   └── AuthView.vue
│   ├── components/
│   │   ├── TabBar.vue               # Persistent bottom nav (4 tabs, live count pill)
│   │   ├── ProjectGroup.vue         # Collapsible project + nested sessions (RecentView)
│   │   ├── FolderBrowser.vue        # Shared dir browser + create-folder
│   │   ├── CommandPalette.vue       # Ctrl+K — full-text search over all transcripts
│   │   ├── RcBadge.vue / RcControls.vue / RcClaudeLink.vue
│   │   └── ChatMessages.vue / MessageItem.vue / ToolGroup.vue / ...
│   ├── composables/useApi.js    # Global singleton HTTP API + useChatApi() per-ChatView
│   └── utils/slug.js            # Client mirror of server pathToSlug + claudeUrl()
└── docs/http-api-v2.md  # Authoritative HTTP API reference
```

## Key Concepts

### Navigation shell
`App.vue` is a two-row grid (`1fr auto`, `100dvh`): `<router-view>` above, `<TabBar>` below. The tab bar is a grid row rather than `position: fixed`, so it never overlaps `ChatView`'s session panel and needs no content padding; it reserves `env(safe-area-inset-bottom)` for the iOS home indicator. It renders on every route except `/auth`.

The four tabs are the app's entry points. `SessionsView` and `ChatView` are *not* tabs — they highlight no tab and are reached by drilling in; each carries its own back link. There is no sidebar and no settings modal (both removed in the v2 tab restructure).

### Cross-session search
`CommandPalette.vue` (Ctrl+K, or the search icon in RecentView's header for touch) is a debounced client over `GET /api/v2/sessions/search`, rendering transcript snippets and match counts. It emits `navigate` rather than pushing routes itself — `App.vue` owns the `useBackButton` sentinel and must consume it before navigating, otherwise the overlay's `history.back()` cancels the pending push.

### Live session registry
Every running `claude` process writes `~/.claude/sessions/{pid}.json` (sessionId, cwd, status busy/idle, entrypoint cli/sdk-*, `bridgeSessionId` when the RC bridge is connected). Stale files are never cleaned up by claude — `session-registry.js` validates liveness with `kill(pid, 0)` + `/proc/{pid}/stat` field 22 (`procStart`) to defeat PID reuse.

### RC launcher
`rc-launcher.js` spawns `claude --resume <id>` / `--session-id <uuid>` inside a **detached tmux session** named `cc-<first8ofSessionId>` — the tmux pane supplies the PTY the REPL needs to stay alive. The pane runs `claude` via `exec`, so the shell is replaced and `#{pane_pid}` *is* the claude PID (no shell child to hunt). It then polls the registry to confirm startup (max 8s, extended while the process is still alive) and serializes concurrent starts per (project, session). Spawns default to `--dangerously-skip-permissions`. **Prerequisite**: `remoteControlAtStartup: true` in `~/.claude/settings.json` so all sessions register for RC. `stopSession` re-validates procStart before `SIGTERM`→`SIGKILL` to avoid murdering a recycled PID.

**SSH fallback**: `tmux attach -t cc-<first8ofSessionId>` from any SSH session drops you into a running session for manual intervention, bypassing tofucode entirely.

### Remote URL
`https://claude.ai/code/{bridgeSessionId}` — built from the registry's `bridgeSessionId` (NOT the local session UUID). Only live while the process runs and the bridge is connected (`rcActive`). Rendered by `RcClaudeLink.vue`.

### Slugs
Project slug = path with `/` AND `.` replaced by `-`, leading dash (e.g. `/home/ts/projects/picotofu.com` → `-home-ts-projects-picotofu-com`). `src/utils/slug.js` mirrors `server/config.js pathToSlug` exactly — keep them in sync. Reverse mapping (`slugToPath`) probes the filesystem; never reconstruct paths client-side.

### HTTP API architecture
- **Global singleton** (`useApi`): projects, recent sessions, live sessions (polled every 10s), search, folder browsing.
- **Per-ChatView** (`useChatApi`): one instance per ChatView for history loading/pagination/older-messages.

API reference: `docs/http-api-v2.md`.

## Development

```bash
npm install
npm run dev      # nodemon (manual restart) + Vite
npm run check    # Biome lint + format (always run after changes)
npm run build    # production frontend build (required — server serves dist/)
```

### Server Management
- Dev server runs via nodemon in manual restart mode — press `rs` + Enter to restart
- Server logs stream to `dev.log`
- **Always get user consent before restarting the server** (exception: explicitly permitted small changes)

### Code Style
- Vue 3 Composition API with `<script setup>`; shared state via composables
- Reuse design tokens in `src/assets/main.css`; shared `.spin` spinner utility is global
- **Always run `npm run check` after implementation**, then `npm run build` for frontend changes

### Post-Implementation Review
After every implementation: remove dead code, check for regressions, keep it lean, then re-run `npm run check` + `npm run build`.

### Environment Variables
All new env vars must be documented in `.env.example` with comments.

## Release Process

### Branch Strategy
- Features branch from `main` → `feature/*`; release prep on `release/v{version}`
- v2 work currently lives on the `v2` effort (v1.5.0 is the last published npm version)

### Determine Version
```bash
node -p "require('./package.json').version"   # local
git tag --list "v*" --sort=-v:refname | head  # tags
npm info tofucode version                      # published ground truth
```

### Pre-Release Checklist
1. **CHANGELOG**: move `## [Unreleased]` → `## [{version}] - {date}`
2. **Security audit**: static review of new code + `npm audit` (+ `npm audit fix`); create `docs/security_report_v{version}.md`; all Critical/High resolved or formally accepted
3. **README**: add the new security report link
4. **Bump**: `npm version {patch|minor|major} --no-git-tag-version`
5. **Verify**: `npm run check` + `npm run build` clean

### Release Steps
```bash
git add CHANGELOG.md README.md package.json package-lock.json docs/security_report_v{version}.md
git commit -m "Release v{version}"
git checkout -b release/v{version} && git push origin release/v{version}
git tag v{version} && git push origin v{version}
npm publish
docker buildx build --platform linux/amd64,linux/arm64 \
  --tag picotofu/tofucode:{version} --tag picotofu/tofucode:latest --push .
git checkout main && git merge release/v{version} && git push origin main
```

### Post-Release
- Verify: `npm info tofucode version` and `docker pull picotofu/tofucode:latest`
- Keep the release branch (hotfix reference)
