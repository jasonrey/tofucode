/**
 * RC Launcher — idempotent spawn/stop of claude --rc sessions via tmux.
 *
 * Each session runs in a detached tmux window named cc-<first8ofSessionId>.
 * The tmux window provides the PTY that claude needs to stay alive as an
 * interactive REPL. The process inside the pane is claude directly (via `exec`)
 * so #{pane_pid} == claude PID — no shell child to hunt.
 *
 * SSH fallback: `tmux attach -t cc-<name>` from any SSH session for manual
 * intervention without going through tofucode.
 *
 * State machine (startSession):
 *   1. Resolve projectSlug → cwd; missing dir → failed
 *   2. If sessionId given: validate UUID, check live registry (idempotent return),
 *      verify JSONL exists, spawn --resume
 *   3. If no sessionId: generate one, spawn --session-id <uuid>
 *   4. Poll registry until {pid}.json appears (max 8s)
 *   5. On timeout/exit: if allowFallbackToNew, retry as new session; else failed
 */

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToSlug, slugToPath } from '../config.js';
import { logger } from './logger.js';
import {
  findLiveBySessionId,
  isProcessAlive,
  isProcessRunning,
  readRegistryFile,
} from './session-registry.js';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

// Active tmux sessions spawned by this server: tmuxName → { innerPid }
// Used to extend the registry wait if the process is still alive but slow to
// write its registry file.
const activeTmuxSessions = new Map();

/** Derive a stable tmux session name from a session UUID. */
function tmuxName(sessionId) {
  return `cc-${sessionId.slice(0, 8)}`;
}

/** Build claude argv. RC is always on via global remoteControlAtStartup setting. */
function buildArgs({
  sessionId,
  resume = false,
  name,
  model,
  skipPermissions = true,
} = {}) {
  const args = [];
  if (skipPermissions) args.push('--dangerously-skip-permissions');
  if (resume && sessionId) {
    args.push('--resume', sessionId);
  } else if (sessionId) {
    args.push('--session-id', sessionId);
  }
  if (name) args.push('--name', name);
  if (model) args.push('--model', model);
  return args;
}

/**
 * Spawn claude inside a detached tmux session.
 *
 * Uses `exec` so the shell is replaced by claude — #{pane_pid} equals the
 * claude PID directly, matching the ~/.claude/sessions/{pid}.json filename.
 *
 * Returns the inner (claude) PID.
 */
/** Single-quote a shell argument, escaping any internal single quotes. */
function shellQuote(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}

function spawnTmux(args, cwd, name) {
  // exec replaces the shell so tmux pane_pid == claude pid.
  // Each arg is single-quoted so spaces and metacharacters in --name / --model
  // are passed verbatim to claude rather than being interpreted by the shell.
  const shellCmd = `exec claude ${args.map(shellQuote).join(' ')}`;

  execFileSync('tmux', ['new-session', '-d', '-s', name, '-c', cwd, shellCmd], {
    env: process.env,
  });

  const pidStr = execFileSync(
    'tmux',
    ['list-panes', '-t', name, '-F', '#{pane_pid}'],
    { encoding: 'utf8' },
  ).trim();
  const innerPid = Number.parseInt(pidStr, 10);
  if (Number.isNaN(innerPid)) {
    killTmuxSession(name);
    throw new Error(`tmux list-panes returned no pid for session ${name}`);
  }

  activeTmuxSessions.set(name, { innerPid });
  logger.log(
    `[rc-launcher] Spawned tmux=${name} innerPid=${innerPid} args=${args.join(' ')} cwd=${cwd}`,
  );
  return innerPid;
}

/**
 * Kill a tmux session by name. Safe to call even if the session no longer
 * exists — tmux exits non-zero in that case, which we swallow.
 */
function killTmuxSession(name) {
  try {
    execFileSync('tmux', ['kill-session', '-t', name], { stdio: 'ignore' });
  } catch {
    // Session already gone — not an error
  }
}

/**
 * Poll ~/.claude/sessions/{pid}.json until it appears and validates,
 * or until timeoutMs elapses.
 */
async function waitForRegistry(
  pid,
  { timeoutMs = 8000, intervalMs = 250 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const entry = readRegistryFile(pid);
    if (entry && isProcessAlive(pid, entry.procStart)) return entry;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

/**
 * Like waitForRegistry, but if the first wait times out and the process is
 * still alive (just slow to write its registry file), extends the wait by
 * extendedMs rather than immediately declaring failure.
 */
async function waitForRegistryWithExtension(
  pid,
  { timeoutMs = 8000, extendedMs = 10000, intervalMs = 250 } = {},
) {
  const entry = await waitForRegistry(pid, { timeoutMs, intervalMs });
  if (entry) return entry;

  // If the process is still alive it's just slow — give it more time.
  // isProcessRunning (signal-0 only) is correct here: we have no procStart yet
  // since the registry entry hasn't appeared.
  if (isProcessRunning(pid)) {
    logger.log(
      `[rc-launcher] Registry not ready after ${timeoutMs}ms for pid=${pid}, process still alive — extending wait`,
    );
    return waitForRegistry(pid, { timeoutMs: extendedMs, intervalMs });
  }
  return null;
}

/** Validate a string is a plausible UUID v4. */
function isValidUUID(s) {
  return (
    typeof s === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );
}

/** Check JSONL exists for a session under a project slug. */
function jsonlExists(projectSlug, sessionId) {
  return existsSync(join(PROJECTS_DIR, projectSlug, `${sessionId}.jsonl`));
}

// Per-(projectSlug,sessionId) serialization to prevent concurrent double-spawns
const spawnLocks = new Map();

async function withLock(key, fn) {
  const prev = spawnLocks.get(key) ?? Promise.resolve();
  const next = prev.then(fn);
  const stored = next.catch(() => {});
  spawnLocks.set(key, stored);
  try {
    return await next;
  } finally {
    if (spawnLocks.get(key) === stored) {
      spawnLocks.delete(key);
    }
  }
}

/**
 * Idempotent session start.
 *
 * @param {object} opts
 * @param {string} opts.projectSlug
 * @param {string} [opts.sessionId]   - resume this session (or verify it's live)
 * @param {string} [opts.name]        - display name shown in native app
 * @param {string} [opts.model]       - model override
 * @param {boolean} [opts.allowFallbackToNew=false]  - start fresh if resume fails
 * @param {boolean} [opts.skipPermissions=true]
 *
 * @returns {Promise<{status:'existing'|'started'|'resumed'|'failed', pid?:number, sessionId?:string, message?:string}>}
 */
export async function startSession({
  projectSlug,
  sessionId,
  name,
  model,
  allowFallbackToNew = false,
  skipPermissions = true,
} = {}) {
  const lockKey = `${projectSlug}::${sessionId ?? 'new'}`;
  return withLock(lockKey, () =>
    _startSession({
      projectSlug,
      sessionId,
      name,
      model,
      allowFallbackToNew,
      skipPermissions,
    }),
  );
}

async function _startSession({
  projectSlug,
  sessionId,
  name,
  model,
  allowFallbackToNew,
  skipPermissions,
}) {
  // 1. Resolve project path
  const cwd = slugToPath(projectSlug);
  if (!cwd || !existsSync(cwd)) {
    return {
      status: 'failed',
      message: `Project directory not found for slug: ${projectSlug}`,
    };
  }

  // 2. Session ID given → resume path
  if (sessionId) {
    if (!isValidUUID(sessionId)) {
      return {
        status: 'failed',
        message: `Corrupted session id: ${sessionId}`,
      };
    }

    // Idempotency: already live
    const live = findLiveBySessionId(sessionId);
    if (live) {
      logger.log(
        `[rc-launcher] Session already live pid=${live.pid} sessionId=${sessionId}`,
      );
      return { status: 'existing', pid: live.pid, sessionId };
    }

    // Check JSONL exists for resume
    if (!jsonlExists(projectSlug, sessionId)) {
      if (!allowFallbackToNew) {
        return {
          status: 'failed',
          message: `JSONL not found for session ${sessionId}`,
        };
      }
      logger.log(
        `[rc-launcher] JSONL missing for ${sessionId}, falling back to new session`,
      );
      return withLock(`${projectSlug}::new`, () =>
        _spawnNew({ cwd, name, model, skipPermissions }),
      );
    }

    // Spawn resume — session ID known upfront, tmux name stable
    const tname = tmuxName(sessionId);
    const pid = spawnTmux(
      buildArgs({ sessionId, resume: true, name, model, skipPermissions }),
      cwd,
      tname,
    );
    const entry = await waitForRegistryWithExtension(pid);

    if (!entry) {
      killTmuxSession(tname);
      activeTmuxSessions.delete(tname);
      if (!allowFallbackToNew) {
        return {
          status: 'failed',
          message: `Resume failed: process exited without registering (sessionId=${sessionId})`,
        };
      }
      logger.log(
        `[rc-launcher] Resume failed for ${sessionId}, falling back to new session`,
      );
      return withLock(`${projectSlug}::new`, () =>
        _spawnNew({ cwd, name, model, skipPermissions }),
      );
    }

    logger.log(
      `[rc-launcher] Resumed session tmux=${tname} pid=${pid} sessionId=${entry.sessionId}`,
    );
    return { status: 'resumed', pid, sessionId: entry.sessionId };
  }

  // 3. New session
  return _spawnNew({ cwd, name, model, skipPermissions });
}

async function _spawnNew({ cwd, name, model, skipPermissions }) {
  // UUID generated before spawn — tmux session named from it immediately.
  // No gap: we always know the session ID upfront.
  const newSessionId = randomUUID();
  const tname = tmuxName(newSessionId);
  const pid = spawnTmux(
    buildArgs({
      sessionId: newSessionId,
      resume: false,
      name,
      model,
      skipPermissions,
    }),
    cwd,
    tname,
  );
  const entry = await waitForRegistryWithExtension(pid);

  if (!entry) {
    killTmuxSession(tname);
    activeTmuxSessions.delete(tname);
    return {
      status: 'failed',
      message: 'Spawn failed: process exited without writing registry entry',
    };
  }

  logger.log(
    `[rc-launcher] New session started tmux=${tname} pid=${pid} sessionId=${entry.sessionId}`,
  );
  return { status: 'started', pid, sessionId: entry.sessionId };
}

/**
 * Stop a session by pid or sessionId.
 * Validates procStart before killing to avoid murdering a recycled PID.
 * Acquires the per-session spawn lock to serialize against concurrent startSession.
 *
 * @returns {Promise<{status:'killed'|'not_found', pid?:number, sessionId?:string}>}
 */
export async function stopSession({ pid, sessionId } = {}) {
  let resolvedPid = pid;

  if (!resolvedPid && sessionId) {
    const live = findLiveBySessionId(sessionId);
    if (!live) return { status: 'not_found', sessionId };
    resolvedPid = live.pid;
  }

  if (!resolvedPid) return { status: 'not_found' };

  const registryEntry = readRegistryFile(resolvedPid);
  if (!registryEntry || !isProcessAlive(resolvedPid, registryEntry.procStart)) {
    return { status: 'not_found', pid: resolvedPid };
  }

  // Acquire per-session lock to serialize against concurrent startSession idempotency checks
  const lockSlug = registryEntry.cwd ? pathToSlug(registryEntry.cwd) : null;
  const lockSid = registryEntry.sessionId;
  if (lockSlug && lockSid) {
    return withLock(`${lockSlug}::${lockSid}`, () =>
      _doStop(resolvedPid, registryEntry.procStart, registryEntry.sessionId),
    );
  }
  return _doStop(resolvedPid, registryEntry.procStart, registryEntry.sessionId);
}

async function _doStop(resolvedPid, expectedProcStart, sessionId) {
  // Re-validate: process may have exited between resolution and lock acquisition
  if (!isProcessAlive(resolvedPid, expectedProcStart)) {
    return { status: 'not_found', pid: resolvedPid };
  }

  // SIGTERM → wait 2s → SIGKILL
  try {
    process.kill(resolvedPid, 'SIGTERM');
    await new Promise((r) => setTimeout(r, 2000));
    try {
      process.kill(resolvedPid, 'SIGKILL');
    } catch {
      // Already exited — expected, not an error
    }
  } catch (err) {
    logger.error(
      `[rc-launcher] kill failed pid=${resolvedPid}: ${err.message}`,
    );
    if (sessionId) killTmuxSession(tmuxName(sessionId));
    return { status: 'not_found', pid: resolvedPid };
  }

  // Clean up the tmux session so it doesn't linger as a dead window
  if (sessionId) {
    const tname = tmuxName(sessionId);
    killTmuxSession(tname);
    activeTmuxSessions.delete(tname);
  }

  // Wait for the process to truly die before returning (zombie reap window)
  const deadline = Date.now() + 1000;
  while (
    isProcessAlive(resolvedPid, expectedProcStart) &&
    Date.now() < deadline
  ) {
    await new Promise((r) => setTimeout(r, 30));
  }

  logger.log(
    `[rc-launcher] Stopped pid=${resolvedPid} tmux=${sessionId ? tmuxName(sessionId) : 'unknown'}`,
  );
  return { status: 'killed', pid: resolvedPid };
}

/**
 * Kill all tmux sessions owned by this server process (called on graceful shutdown).
 */
export function killAllManagedSessions() {
  for (const [name] of activeTmuxSessions) {
    killTmuxSession(name);
    logger.log(`[rc-launcher] Killed tmux session ${name} on shutdown`);
  }
  activeTmuxSessions.clear();
}

/**
 * Kill any cc-* tmux sessions whose inner process is no longer alive.
 * Call on server startup to clean up sessions left over from a previous run.
 */
export function cleanupOrphanedTmuxSessions() {
  let sessionNames;
  try {
    const out = execFileSync(
      'tmux',
      ['list-sessions', '-F', '#{session_name}'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    sessionNames = out
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.startsWith('cc-'));
  } catch {
    return; // tmux not running or no sessions — nothing to clean up
  }

  for (const name of sessionNames) {
    try {
      const pidStr = execFileSync(
        'tmux',
        ['list-panes', '-t', name, '-F', '#{pane_pid}'],
        { encoding: 'utf8' },
      ).trim();
      const innerPid = Number.parseInt(pidStr, 10);
      if (Number.isNaN(innerPid) || !isProcessRunning(innerPid)) {
        killTmuxSession(name);
        logger.log(
          `[rc-launcher] Cleaned up orphaned tmux session ${name} (pid=${innerPid} dead)`,
        );
      }
    } catch {
      // Can't inspect — kill it to be safe
      killTmuxSession(name);
      logger.log(`[rc-launcher] Cleaned up uninspectable tmux session ${name}`);
    }
  }
}
