/**
 * RC Launcher — idempotent spawn/stop of claude --rc sessions.
 *
 * Requires node-pty: claude is an interactive REPL that exits immediately
 * if stdin is not a TTY. We allocate a PTY and hold it open as long as
 * the tofucode server is running. The PTY fd keeps the REPL alive;
 * we do not relay output (claude's RC bridge handles all IO to the native app).
 *
 * State machine (startSession):
 *   1. Resolve projectSlug → cwd; missing dir → failed
 *   2. If sessionId given: validate UUID, check live registry (idempotent return),
 *      verify JSONL exists, spawn --resume
 *   3. If no sessionId: generate one, spawn --session-id <uuid>
 *   4. Poll registry until {pid}.json appears (max 8s)
 *   5. On timeout/exit: if allowFallbackToNew, retry as new session; else failed
 */

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import pty from 'node-pty';
import { pathToSlug, slugToPath } from '../config.js';
import { logger } from './logger.js';
import {
  findLiveBySessionId,
  isProcessAlive,
  readRegistryFile,
} from './session-registry.js';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

// Active PTY map: pid → ptyProcess. Kept alive as long as the server runs.
// On SIGTERM/SIGINT, the PTY processes get their SIGHUP from the OS anyway.
const activePtys = new Map();

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

/** Allocate a PTY and spawn claude. Returns the pid. */
function spawnPty(args, cwd) {
  const ptyProcess = pty.spawn('claude', args, {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd,
    env: process.env,
  });
  activePtys.set(ptyProcess.pid, ptyProcess);

  ptyProcess.onExit(({ exitCode, signal }) => {
    activePtys.delete(ptyProcess.pid);
    logger.log(
      `[rc-launcher] PTY exited pid=${ptyProcess.pid} code=${exitCode} signal=${signal}`,
    );
  });

  logger.log(
    `[rc-launcher] Spawned claude pid=${ptyProcess.pid} args=${args.join(' ')} cwd=${cwd}`,
  );
  return ptyProcess.pid;
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

    // Spawn resume
    const pid = spawnPty(
      buildArgs({ sessionId, resume: true, name, model, skipPermissions }),
      cwd,
    );
    const entry = await waitForRegistry(pid);

    if (!entry) {
      // Process died before writing registry (resume failed — e.g. session corrupted)
      activePtys.delete(pid);
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
      `[rc-launcher] Resumed session pid=${pid} sessionId=${entry.sessionId}`,
    );
    return { status: 'resumed', pid, sessionId: entry.sessionId };
  }

  // 3. New session
  return _spawnNew({ cwd, name, model, skipPermissions });
}

async function _spawnNew({ cwd, name, model, skipPermissions }) {
  const newSessionId = randomUUID();
  const pid = spawnPty(
    buildArgs({
      sessionId: newSessionId,
      resume: false,
      name,
      model,
      skipPermissions,
    }),
    cwd,
  );
  const entry = await waitForRegistry(pid);

  if (!entry) {
    activePtys.delete(pid);
    return {
      status: 'failed',
      message: 'Spawn failed: process exited without writing registry entry',
    };
  }

  logger.log(
    `[rc-launcher] New session started pid=${pid} sessionId=${entry.sessionId}`,
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
      _doStop(resolvedPid, registryEntry.procStart),
    );
  }
  return _doStop(resolvedPid, registryEntry.procStart);
}

async function _doStop(resolvedPid, expectedProcStart) {
  // Re-validate: process may have exited between resolution and lock acquisition
  if (!isProcessAlive(resolvedPid, expectedProcStart)) {
    return { status: 'not_found', pid: resolvedPid };
  }

  const cleanupPty = () => {
    const ptyProcess = activePtys.get(resolvedPid);
    if (ptyProcess) {
      try {
        ptyProcess.kill();
      } catch {}
      activePtys.delete(resolvedPid);
    }
  };

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
    cleanupPty();
    return { status: 'not_found', pid: resolvedPid };
  }

  cleanupPty();
  logger.log(`[rc-launcher] Stopped pid=${resolvedPid}`);
  return { status: 'killed', pid: resolvedPid };
}

/** Kill all PTYs owned by this server process (called on graceful shutdown). */
export function killAllManagedPtys() {
  for (const [pid, ptyProcess] of activePtys) {
    try {
      ptyProcess.kill();
      logger.log(`[rc-launcher] Killed managed PTY pid=${pid} on shutdown`);
    } catch {}
  }
  activePtys.clear();
}
