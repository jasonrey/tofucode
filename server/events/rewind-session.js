/**
 * Event: rewind_session
 *
 * Truncates a session's JSONL file at a given turn, removing that turn and
 * everything after it. Stores the removed content for a short undo window.
 *
 * @event rewind_session
 * @param {Object} message - { sessionId: string, keepGlobalTurns: number }
 *
 * @event rewind_session:undo
 * @param {Object} message - { sessionId: string }
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSessionsDir } from '../config.js';
import { logger } from '../lib/logger.js';
import { isValidSessionId, loadSessionHistory } from '../lib/sessions.js';
import { tasks } from '../lib/tasks.js';
import { send } from '../lib/ws.js';

const UNDO_TTL_MS = 15_000;

// sessionId → { original: string, timer: TimeoutId }
const undoStore = new Map();

function isUserTurnLine(line) {
  if (!line.trim()) return false;
  try {
    const entry = JSON.parse(line);
    if (entry.type !== 'user' && entry.type !== 'human') return false;
    const content = entry.message?.content;
    if (typeof content === 'string') return content.trim().length > 0;
    if (Array.isArray(content))
      return content.some((b) => b.type === 'text' && b.text?.trim());
    return false;
  } catch {
    return false;
  }
}

export async function handler(ws, message, context) {
  const { sessionId, keepGlobalTurns } = message;

  if (!isValidSessionId(sessionId)) {
    send(ws, { type: 'rewind_session:error', message: 'Invalid session ID' });
    return;
  }

  if (typeof keepGlobalTurns !== 'number' || keepGlobalTurns < 0) {
    send(ws, {
      type: 'rewind_session:error',
      message: 'Invalid keepGlobalTurns',
    });
    return;
  }

  // Block if session is currently running
  const task = tasks.get(sessionId);
  if (task?.status === 'running') {
    send(ws, {
      type: 'rewind_session:error',
      message: 'Cancel the running task before rewinding',
    });
    return;
  }

  const projectSlug = context.currentProjectPath;
  const sessionsDir = getSessionsDir(projectSlug);
  const jsonlPath = join(sessionsDir, `${sessionId}.jsonl`);

  if (!existsSync(jsonlPath)) {
    send(ws, {
      type: 'rewind_session:error',
      message: 'Session file not found',
    });
    return;
  }

  try {
    const original = readFileSync(jsonlPath, 'utf-8');
    const lines = original.split('\n');

    // Find the line index of the keepGlobalTurns-th user turn (0-based count)
    // That line and everything after it will be removed.
    let userTurnCount = 0;
    let cutLineIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      if (isUserTurnLine(lines[i])) {
        if (userTurnCount === keepGlobalTurns) {
          cutLineIndex = i;
          break;
        }
        userTurnCount++;
      }
    }

    if (cutLineIndex === -1) {
      send(ws, {
        type: 'rewind_session:error',
        message: 'Turn not found in session history',
      });
      return;
    }

    const keptLines = lines.slice(0, cutLineIndex).filter((l) => l.trim());
    const newContent = keptLines.length > 0 ? `${keptLines.join('\n')}\n` : '';

    writeFileSync(jsonlPath, newContent, 'utf-8');

    // Store original file for undo
    const existing = undoStore.get(sessionId);
    if (existing?.timer) clearTimeout(existing.timer);
    const timer = setTimeout(() => undoStore.delete(sessionId), UNDO_TTL_MS);
    undoStore.set(sessionId, { original, timer });

    const history = await loadSessionHistory(projectSlug, sessionId, {
      fullHistory: true,
    });

    logger.info(
      `[rewind-session] ${sessionId}: rewound to ${keepGlobalTurns} global turns`,
    );

    send(ws, {
      type: 'rewind_session:result',
      sessionId,
      messages: history.messages,
      hasOlderMessages: false,
      totalTurns: history.totalTurns,
      loadedTurns: history.loadedTurns,
      canUndo: true,
      undoTtl: UNDO_TTL_MS,
    });
  } catch (err) {
    logger.error(`[rewind-session] ${err.message}`);
    send(ws, {
      type: 'rewind_session:error',
      message: `Rewind failed: ${err.message}`,
    });
  }
}

export async function undoHandler(ws, message, context) {
  const { sessionId } = message;

  if (!isValidSessionId(sessionId)) {
    send(ws, { type: 'rewind_session:error', message: 'Invalid session ID' });
    return;
  }

  const stored = undoStore.get(sessionId);
  if (!stored) {
    send(ws, {
      type: 'rewind_session:error',
      message: 'Undo window has expired',
    });
    return;
  }

  const projectSlug = context.currentProjectPath;
  const sessionsDir = getSessionsDir(projectSlug);
  const jsonlPath = join(sessionsDir, `${sessionId}.jsonl`);

  try {
    writeFileSync(jsonlPath, stored.original, 'utf-8');
    clearTimeout(stored.timer);
    undoStore.delete(sessionId);

    const history = await loadSessionHistory(projectSlug, sessionId, {
      fullHistory: true,
    });

    logger.info(`[rewind-session] ${sessionId}: undo successful`);

    send(ws, {
      type: 'rewind_session:result',
      sessionId,
      messages: history.messages,
      hasOlderMessages: false,
      totalTurns: history.totalTurns,
      loadedTurns: history.loadedTurns,
      canUndo: false,
    });
  } catch (err) {
    logger.error(`[rewind-session] undo: ${err.message}`);
    send(ws, {
      type: 'rewind_session:error',
      message: `Undo failed: ${err.message}`,
    });
  }
}
