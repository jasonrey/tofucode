/**
 * Read-only view of the live ~/.claude/sessions/ registry.
 *
 * Each running claude process writes a {pid}.json file there. Files for
 * dead PIDs are NOT cleaned up by claude, so every entry must be validated
 * against /proc/{pid}/stat before being trusted.
 *
 * The procStart field (from the registry file) matches field 22 of
 * /proc/{pid}/stat (the kernel starttime in clock ticks). This defeats
 * PID reuse: if a new process took the same PID, its starttime won't match.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToSlug } from '../config.js';

const SESSIONS_DIR = join(homedir(), '.claude', 'sessions');

/**
 * Parse /proc/{pid}/stat field 22 (starttime, clock ticks since boot).
 * Field 2 (comm) may contain spaces/parens so we split after the last ')'.
 */
export function readProcStart(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const afterComm = stat.slice(stat.lastIndexOf(')') + 2);
    // fields after comm are space-separated; starttime is field index 19
    // (0-based: state=0, ppid=1, ... starttime=19)
    const fields = afterComm.split(' ');
    if (fields[0] === 'Z') return null; // zombie — treat as dead
    return fields[19] ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns true if the process exists (signal-0 check only, no PID-reuse guard).
 * Use when expectedProcStart is unavailable (e.g. startup cleanup, slow-start check).
 */
export function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns true if pid is alive AND maps to the expected process (not a
 * recycled PID with the same number).
 */
export function isProcessAlive(pid, expectedProcStart) {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  const actual = readProcStart(pid);
  return actual !== null && actual === String(expectedProcStart);
}

/**
 * Parse a single {pid}.json registry file. Returns null on any error.
 */
export function readRegistryFile(pid) {
  try {
    return JSON.parse(readFileSync(join(SESSIONS_DIR, `${pid}.json`), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * List all validated live sessions.
 * Stale files (dead PIDs) are filtered out but never deleted.
 *
 * @returns {Array<{pid,sessionId,cwd,projectSlug,entrypoint,kind,status,startedAt,rcActive}>}
 */
export function listLiveSessions() {
  let files;
  try {
    files = readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }

  const results = [];
  for (const file of files) {
    const pid = Number.parseInt(file.replace('.json', ''), 10);
    if (!pid) continue;
    const entry = readRegistryFile(pid);
    if (!entry) continue;
    if (!isProcessAlive(pid, entry.procStart)) continue;

    results.push({
      pid: entry.pid,
      sessionId: entry.sessionId,
      cwd: entry.cwd,
      projectSlug: entry.cwd ? pathToSlug(entry.cwd) : null,
      entrypoint: entry.entrypoint,
      kind: entry.kind,
      status: entry.status,
      startedAt: entry.startedAt,
      rcActive: !!entry.bridgeSessionId,
      bridgeSessionId: entry.bridgeSessionId ?? null,
    });
  }
  return results;
}

/**
 * Find the validated live session entry for a given sessionId.
 * Returns null if not found or the process is dead.
 */
export function findLiveBySessionId(sessionId) {
  return listLiveSessions().find((s) => s.sessionId === sessionId) ?? null;
}

/**
 * Find the validated live session entry for a given pid.
 * Returns null if not found or the process is dead.
 */
export function findLiveByPid(pid) {
  const entry = readRegistryFile(pid);
  if (!entry) return null;
  if (!isProcessAlive(pid, entry.procStart)) return null;
  return {
    pid: entry.pid,
    sessionId: entry.sessionId,
    cwd: entry.cwd,
    projectSlug: entry.cwd ? pathToSlug(entry.cwd) : null,
    entrypoint: entry.entrypoint,
    kind: entry.kind,
    status: entry.status,
    startedAt: entry.startedAt,
    rcActive: !!entry.bridgeSessionId,
    bridgeSessionId: entry.bridgeSessionId ?? null,
  };
}
