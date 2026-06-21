# tofucode HTTP API v2

Base path: `/api/v2`
Auth: httpOnly session cookie (same as `/api/auth/*` login flow)
Content-Type: `application/json` (all requests and responses)
Errors: `{ "error": "message" }` — HTTP 400/401/403/404/500

---

## System

### GET /api/v2/info

Replaces the `connected` + `update_available` WS connection-time pushes.

**Response 200:**
```json
{
  "version": "string",
  "homePath": "string",
  "rootPath": "string | null",
  "updateAvailable": {
    "currentVersion": "string",
    "latestVersion": "string",
    "updateUrl": "string"
  }
}
```

`updateAvailable` is omitted when no update is available.

---

## Projects

### GET /api/v2/projects

Returns all projects. Replaces `get_projects`.

**Response 200:**
```json
{ "projects": [{ "slug": "string", "name": "string", "path": "string", "sessionCount": 0, "lastModified": "string" }] }
```

### POST /api/v2/projects

Create a new project folder. Replaces `project:create`.

**Body:** `{ "parentPath": "string", "name": "string" }`

**Response 201:** `{ "projectSlug": "string", "path": "string" }`

**Response 400:** `{ "error": "string" }` (name contains path separators; parentPath outside home; already exists)

### GET /api/v2/projects/:projectSlug/sessions

Project info + session list. Collapses `select_project` + `get_sessions` into one request.

**Response 200:**
```json
{
  "project": { "slug": "string", "name": "string", "path": "string", "sessionCount": 0, "lastModified": "string" },
  "sessions": [{ "sessionId": "string", "title": "string|null", "firstPrompt": "string", "messageCount": 0, "created": "string", "modified": "string" }]
}
```

**Response 403:** rootPath violation

### DELETE /api/v2/projects/:projectSlug/sessions/:sessionId

Delete a session. Replaces `delete_session` (broadcast dropped).

**Response 200:** `{ "sessionId": "string" }`

**Response 404:** session not found

---

## Session History

### GET /api/v2/projects/:projectSlug/sessions/:sessionId

Load session history. Collapses `select_session`'s two WS responses into one.

**Query params:** `fullHistory` (bool), `offset` (int, default 0), `loadLastTurn` (bool, default true)

**Response 200:**
```json
{
  "sessionId": "string",
  "messages": [],
  "hasOlderMessages": true,
  "summaryCount": 0,
  "totalEntries": 0,
  "totalTurns": 0,
  "loadedTurns": 0,
  "offset": 0
}
```

### GET /api/v2/projects/:projectSlug/sessions/:sessionId/older

Paginate backwards. Replaces `load_older_messages`.

**Query params:** `offset` (int, required), `turnLimit` (int, default 5)

**Response 200:** same shape as history endpoint (minus `summaryCount`/`totalEntries`)

---

## Sessions (global)

### GET /api/v2/sessions/recent

Recent sessions across all projects. Replaces `get_recent_sessions`.

**Query params:** `limit` (int, default 50, max 200)

**Response 200:**
```json
{ "sessions": [{ "sessionId": "string", "projectSlug": "string", "projectName": "string", "projectPath": "string", "title": "string|null", "firstPrompt": "string", "messageCount": 0, "created": "string", "modified": "string" }] }
```

### GET /api/v2/sessions/search

Full-text + session ID prefix search. Replaces `search:sessions`.

**Query params:** `q` (string, required), `projectSlug` (string, optional), `limit` (int, default 50)

**Response 200:**
```json
{ "items": [{ "sessionId": "string", "projectSlug": "string", "projectName": "string", "title": "string|null", "snippets": [], "timestamp": "string|null", "matchCount": 0 }], "count": 0, "truncated": false }
```

Empty/whitespace `q` returns `{ items: [], count: 0, truncated: false }` (200, not 400).

---

## Folder Browser

### GET /api/v2/fs/browse

Browse filesystem. Replaces `browse_folder`.

**Query params:** `path` (string, optional — defaults to `$HOME` or `rootPath`)

**Response 200:**
```json
{ "path": "string", "contents": [{ "name": "string", "path": "string", "isDirectory": true }] }
```

---

## RC (Remote Control)

### GET /api/v2/rc/sessions

List live RC sessions. Replaces `rc:list`. Client polls every 10s.

**Response 200:**
```json
{ "sessions": [{ "pid": 0, "sessionId": "string", "cwd": "string", "projectSlug": "string", "entrypoint": "string", "kind": "string", "status": "string", "startedAt": "string", "rcActive": true, "bridgeSessionId": "string|null" }] }
```

### POST /api/v2/rc/sessions

Start (or resume) an RC session. Replaces `rc:start`. Blocks up to ~22s.

**Body:**
```json
{ "projectSlug": "string", "sessionId": "UUID (optional)", "name": "string (optional)", "model": "string (optional)", "allowFallbackToNew": false, "skipPermissions": true }
```

**Response 200:**
```json
{ "status": "existing|started|resumed|failed", "pid": 0, "sessionId": "UUID", "projectSlug": "string", "message": "string (on failed)" }
```

`status: "failed"` uses HTTP 200 (application-level result, not a transport error).

### DELETE /api/v2/rc/sessions/:pid

Stop a session by PID (numeric). Replaces `rc:stop { pid }`.

**Response 200:** `{ "status": "killed|not_found", "pid": 0 }`

### DELETE /api/v2/rc/sessions/by-session/:sessionId

Stop a session by session UUID. Replaces `rc:stop { sessionId }`.

**Response 200:** `{ "status": "killed|not_found", "pid": 0, "sessionId": "string" }`

---

## Security Notes

- `:projectSlug` validated against `/^-[a-zA-Z0-9_.-]+$/` before filesystem use (400 on mismatch)
- `:sessionId` validated with `isValidSessionId()` from `server/lib/sessions.js`
- `rootPath` enforcement (path traversal check) applied on any project-scoped endpoint
- All `/api/v2/*` routes gated by `requireAuth` middleware from `server/lib/api-auth.js`
