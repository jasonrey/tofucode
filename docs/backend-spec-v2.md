# tofucode v2 — Backend WebSocket Spec

Reference for frontend planning. All events are WebSocket messages over `/ws`.

---

## Connection model

- **Protocol**: WebSocket at `ws://host/ws`
- **Auth**: cookie-based (`session` cookie set by `/api/auth/login`). Connection is rejected with HTTP 401 if not authenticated (unless `AUTH_DISABLED=true`).
- **Per-connection state**: each connection tracks `currentProjectPath` (set by `select_project`) and `currentSessionId` (set by `select_session`). Several events depend on this state being set first.
- **Message format**: JSON in both directions. Every message has a `type` string field.

---

## Connection-time server pushes

Sent automatically when the WebSocket connects — no request needed.

### `connected`
```json
{
  "type": "connected",
  "version": "1.5.0",
  "rootPath": "/home/ts/projects" | null,
  "homePath": "/home/ts"
}
```
`rootPath` is non-null when `ROOT_PATH` env is configured (restricts project browsing). `homePath` is the same value (or `$HOME` fallback) — use it as the root for `browse_folder`.

### `update_available` _(optional, only if update exists)_
```json
{
  "type": "update_available",
  "currentVersion": "1.5.0",
  "latestVersion": "1.6.0",
  "updateUrl": "https://www.npmjs.com/package/tofucode"
}
```

---

## Projects

### `get_projects`
**Request:** `{ "type": "get_projects" }`

**Response:** `projects_list`
```json
{
  "type": "projects_list",
  "projects": [
    {
      "slug": "-home-ts-projects-myapp",
      "name": "myapp",
      "path": "/home/ts/projects/myapp",
      "sessionCount": 4,
      "lastModified": "2026-06-05T12:00:00.000Z"
    }
  ]
}
```
Sorted by `lastModified` descending. Only projects with at least one JSONL session file appear.

---

### `select_project`
Sets `context.currentProjectPath`. Required before using session events.

**Request:** `{ "type": "select_project", "path": "-home-ts-projects-myapp" }`
- `path` is a project **slug** (not a filesystem path)

**Response:** `project_selected`
```json
{
  "type": "project_selected",
  "path": "-home-ts-projects-myapp",
  "project": {
    "slug": "-home-ts-projects-myapp",
    "name": "myapp",
    "path": "/home/ts/projects/myapp",
    "sessionCount": 4,
    "lastModified": "2026-06-05T12:00:00.000Z"
  },
  "sessions": [
    {
      "sessionId": "abc123",
      "firstPrompt": "add login page",
      "messageCount": 12,
      "created": "2026-06-01T09:00:00.000Z",
      "modified": "2026-06-05T11:00:00.000Z",
      "title": "Login page feature"
    }
  ]
}
```
**Error:** `{ "type": "error", "message": "..." }` — invalid slug or path outside `rootPath`.

---

### `project:create`
Creates a new project directory. Does **not** auto-start an RC session — call `rc:start` after.

**Request:**
```json
{
  "type": "project:create",
  "parentPath": "/home/ts/projects",
  "name": "my-new-app"
}
```
- `parentPath`: absolute path, must be under `$HOME`
- `name`: no `/`, `\`, or null bytes

**Response:** `project:create:result`
```json
{
  "type": "project:create:result",
  "status": "ok",
  "projectSlug": "-home-ts-projects-my-new-app",
  "path": "/home/ts/projects/my-new-app"
}
```
**Failure:**
```json
{ "type": "project:create:result", "status": "failed", "message": "Directory already exists" }
```

---

### `browse_folder`
Directory browser — used to build the `parentPath` picker for `project:create`.

**Request:** `{ "type": "browse_folder", "path": "/home/ts/projects" }`
- `path: null` defaults to `$HOME`

**Response:** `folder_contents`
```json
{
  "type": "folder_contents",
  "path": "/home/ts/projects",
  "contents": [
    { "name": "myapp", "path": "/home/ts/projects/myapp", "isDirectory": true },
    { "name": "README.md", "path": "/home/ts/projects/README.md", "isDirectory": false }
  ]
}
```

---

## Sessions

All session events require `select_project` to have been called first.

### `get_sessions`
**Request:** `{ "type": "get_sessions" }`

**Response:** `sessions_list`
```json
{
  "type": "sessions_list",
  "sessions": [
    {
      "sessionId": "abc123",
      "firstPrompt": "add login page",
      "messageCount": 12,
      "created": "2026-06-01T09:00:00.000Z",
      "modified": "2026-06-05T11:00:00.000Z",
      "title": "Login page feature"
    }
  ]
}
```
**Note**: `firstPrompt` is the first user message, truncated to 100 chars. Includes all JSONL files for the current project, including SDK/agent sessions.

**Error:** `{ "type": "error", "message": "No project selected" }`

---

### `get_recent_sessions`
Cross-project recent sessions — does **not** require `select_project`.

**Request:** `{ "type": "get_recent_sessions", "limit": 50 }`

**Response:** `recent_sessions`
```json
{
  "type": "recent_sessions",
  "sessions": [
    {
      "sessionId": "abc123",
      "projectSlug": "-home-ts-projects-myapp",
      "projectName": "myapp",
      "projectPath": "/home/ts/projects/myapp",
      "firstPrompt": "add login page",
      "messageCount": 12,
      "created": "2026-06-01T09:00:00.000Z",
      "modified": "2026-06-05T11:00:00.000Z",
      "title": "Login page feature"
    }
  ]
}
```

---

### `select_session`
Sets `context.currentSessionId`. Sends history and notifies other clients.

**Request:**
```json
{
  "type": "select_session",
  "sessionId": "abc123",
  "offset": 0,
  "fullHistory": false,
  "loadLastTurn": true
}
```
- `offset`: turn-based pagination offset (0 = latest)
- `fullHistory`: if true, loads all turns regardless of offset
- `loadLastTurn`: default `true`; if false, skips loading the most recent turn

**Responses (two messages sent in sequence):**

`session_selected`
```json
{
  "type": "session_selected",
  "sessionId": "abc123",
  "projectPath": "/home/ts/projects/myapp",
  "isActiveElsewhere": false
}
```
`isActiveElsewhere` — true if another browser tab is watching this session.

`session_history`
```json
{
  "type": "session_history",
  "sessionId": "abc123",
  "messages": [ /* parsed turn objects */ ],
  "hasOlderMessages": true,
  "summaryCount": 2,
  "totalEntries": 84,
  "totalTurns": 10,
  "loadedTurns": 3,
  "offset": 7
}
```
`offset` in the response is the **effective** offset to pass for the next `load_older_messages` call.

**Broadcast to all clients:**
```json
{ "type": "session_opened", "sessionId": "abc123" }
```

---

### `load_older_messages`
Paginate further back in a session's history.

**Request:**
```json
{
  "type": "load_older_messages",
  "sessionId": "abc123",
  "offset": 7,
  "turnLimit": 5
}
```

**Response:** `older_messages`
```json
{
  "type": "older_messages",
  "sessionId": "abc123",
  "messages": [ /* parsed turn objects */ ],
  "hasOlderMessages": true,
  "totalTurns": 10,
  "loadedTurns": 5,
  "offset": 2
}
```
Use the returned `offset` value for the next call.

---

### `delete_session`
Deletes a session's JSONL file and removes it from the index.

**Request:** `{ "type": "delete_session", "sessionId": "abc123" }`

**Broadcast to all clients:**
```json
{ "type": "session_deleted", "sessionId": "abc123" }
```
**Error:** `{ "type": "error", "message": "Session not found" }`

---

### `get_session_title` / `set_session_title`
Custom session titles stored per-project in `.session-titles.json`. Separate from and not written by claude.

**Get request:** `{ "type": "get_session_title", "sessionId": "abc123" }`

**Get response:** `session_title`
```json
{ "type": "session_title", "sessionId": "abc123", "title": "Login page feature" }
```
`title` is `null` if not set.

**Set request:** `{ "type": "set_session_title", "sessionId": "abc123", "title": "My title" }`
- Pass `null` or empty string to clear the title.

**Set response — broadcast to all clients:** `session_title_updated`
```json
{
  "type": "session_title_updated",
  "sessionId": "abc123",
  "title": "My title",
  "success": true
}
```

---

## RC session management

These events manage claude processes running in `--remote-control` mode on the VM. All sessions are started with `--dangerously-skip-permissions` by default (overridable via `skipPermissions`).

**Prerequisites:** `remoteControlAtStartup: true` must be set in `~/.claude/settings.json`. This makes ALL spawned sessions (including manually started ones) visible in the Claude native app.

---

### `rc:list`
List all currently running claude processes on the VM.

**Request:** `{ "type": "rc:list" }`

**Response:** `rc:list:result`
```json
{
  "type": "rc:list:result",
  "sessions": [
    {
      "pid": 12345,
      "sessionId": "abc-123-...",
      "cwd": "/home/ts/projects/myapp",
      "projectSlug": "-home-ts-projects-myapp",
      "entrypoint": "cli",
      "kind": "interactive",
      "status": "idle",
      "startedAt": 1780636032439,
      "rcActive": true
    }
  ]
}
```

Key fields:
- `entrypoint`: `"cli"` = started interactively (this tool or manual), `"sdk-ts"` / `"sdk-js"` = cron/automation session
- `status`: `"idle"` | `"busy"` — live from the registry
- `rcActive`: `true` when the Claude native app is connected to this session

---

### `rc:start`
Start or resume a claude RC session. Idempotent — safe to call if the session is already running.

**Request:**
```json
{
  "type": "rc:start",
  "projectSlug": "-home-ts-projects-myapp",
  "sessionId": "abc-123-...",
  "name": "My session",
  "model": "claude-opus-4-5",
  "allowFallbackToNew": false,
  "skipPermissions": true
}
```
- `sessionId`: omit to start a fresh session; provide to resume an existing one
- `allowFallbackToNew`: if `true` and the session can't be resumed (JSONL missing, process died), starts a new session instead of failing. **Frontend flow**: send `false` first; on `failed` response, ask user to confirm, then resend with `true`.
- `name`: display name shown in the native app session list
- `model`: model override (omit to use claude's default)
- `skipPermissions`: default `true`

**Response:** `rc:start:result`
```json
{ "type": "rc:start:result", "status": "started", "pid": 12345, "sessionId": "abc-123-..." }
```

`status` values:
| Value | Meaning |
|-------|---------|
| `"started"` | New session spawned |
| `"resumed"` | Existing session resumed |
| `"existing"` | Session was already running — no action taken |
| `"failed"` | Could not start; see `message` field |

On failure:
```json
{ "type": "rc:start:result", "status": "failed", "message": "JSONL not found for session abc-123-..." }
```

---

### `rc:stop`
Stop a running claude session. Validates process identity before killing (prevents murdering a recycled PID).

**Request:** `{ "type": "rc:stop", "sessionId": "abc-123-..." }`
or: `{ "type": "rc:stop", "pid": 12345 }`

**Response:** `rc:stop:result`
```json
{ "type": "rc:stop:result", "status": "killed", "pid": 12345 }
```
or if not found:
```json
{ "type": "rc:stop:result", "status": "not_found", "sessionId": "abc-123-..." }
```

---

## Cross-session search

### `search:sessions`
Full-text search across all JSONL files for all projects. Includes SDK/cron/automation sessions that the native Claude app intentionally hides from its UI. Cancels any in-flight search for the same connection.

**Request:**
```json
{
  "type": "search:sessions",
  "query": "fix auth bug",
  "projectSlug": "-home-ts-projects-myapp",
  "limit": 50
}
```
- `query`: required, non-empty. AND semantics — all whitespace-separated tokens must appear in a matching message.
- `projectSlug`: optional, filters to one project
- `limit`: max sessions to return, default 50

**Response:** `search:sessions:result`
```json
{
  "type": "search:sessions:result",
  "items": [
    {
      "sessionId": "abc-123-...",
      "projectSlug": "-home-ts-projects-myapp",
      "projectName": "myapp",
      "title": "Auth refactor",
      "snippets": [
        "…fix the auth bug in middleware by checking the token expiry…",
        "…found another auth bug in the refresh flow…"
      ],
      "timestamp": "2026-06-05T11:00:00.000Z",
      "matchCount": 2
    }
  ],
  "count": 1,
  "truncated": false
}
```
- `snippets`: up to 3 per session, ~200 chars each, centred on first token match. Ellipsis-prefixed/suffixed when clipped.
- `timestamp`: timestamp of the **most recent** matching message in the session
- `matchCount`: number of snippets collected (max 3); not a total match count
- `truncated`: `true` if results were cut off at `limit` or `maxFilesScanned` (2000)

**Empty query** (or whitespace only) returns immediately: `{ items: [], count: 0, truncated: false }`

---

## Broadcast events (server-initiated)

These are pushed to **all** connected clients, not just the requester.

| Type | Trigger | Key fields |
|------|---------|-----------|
| `session_opened` | `select_session` | `sessionId` |
| `session_deleted` | `delete_session` | `sessionId` |
| `session_title_updated` | `set_session_title` | `sessionId`, `title` |

---

## Error shape

Most error responses use:
```json
{ "type": "error", "message": "Human-readable description" }
```
Some include `sessionId` for context. The global error handler in `websocket.js` wraps unhandled handler throws with `{ "type": "error", "message": "Internal error" }`.

---

## Typical frontend flows

### Open a project and view sessions
```
→ get_projects
← projects_list
→ select_project { path: slug }
← project_selected  (includes sessions list)
→ select_session { sessionId }
← session_selected
← session_history
```

### Start a new RC session for a project
```
→ rc:start { projectSlug, allowFallbackToNew: false }
← rc:start:result { status: "started", pid, sessionId }
   (user opens Claude native app → connects via RC)
→ rc:list  (poll to check rcActive)
← rc:list:result  (rcActive: true when native app connected)
```

### Resume an existing RC session (with fallback consent flow)
```
→ rc:start { projectSlug, sessionId, allowFallbackToNew: false }
← rc:start:result { status: "failed", message: "JSONL not found..." }
   (show user: "session not found, start new?")
→ rc:start { projectSlug, allowFallbackToNew: true }
← rc:start:result { status: "started", pid, sessionId }
```

### Search across all sessions
```
→ search:sessions { query: "auth bug" }
← search:sessions:result { items: [...], truncated: false }
   (user clicks a result → navigate to that project/session)
→ select_project { path: item.projectSlug }
→ select_session { sessionId: item.sessionId }
```

### Create a new project
```
→ browse_folder { path: "/home/ts/projects" }
← folder_contents
   (user picks parent dir and enters name)
→ project:create { parentPath: "/home/ts/projects", name: "new-app" }
← project:create:result { status: "ok", projectSlug, path }
→ rc:start { projectSlug }
← rc:start:result { status: "started", pid, sessionId }
```
