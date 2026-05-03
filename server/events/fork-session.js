/**
 * Event: fork_session
 *
 * Forks a session at a given turn boundary, creating a new session with
 * a copy of the transcript up to (and including) that turn.
 *
 * @event fork_session
 * @param {Object} message - { sessionId: string, keepGlobalTurns: number }
 *   keepGlobalTurns: how many user turns to include in the fork (1 = first turn only)
 *
 * @returns fork_session:result { sourceSessionId, newSessionId }
 * @returns fork_session:error  { message }
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { forkSession } from '@anthropic-ai/claude-agent-sdk';
import { getSessionsDir, slugToPath } from '../config.js';
import { logger } from '../lib/logger.js';
import { isValidSessionId } from '../lib/sessions.js';
import { tasks } from '../lib/tasks.js';
import { send } from '../lib/ws.js';

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
    send(ws, { type: 'fork_session:error', message: 'Invalid session ID' });
    return;
  }

  if (typeof keepGlobalTurns !== 'number' || keepGlobalTurns < 1) {
    send(ws, {
      type: 'fork_session:error',
      message: 'Invalid keepGlobalTurns',
    });
    return;
  }

  const task = tasks.get(sessionId);
  if (task?.status === 'running') {
    send(ws, {
      type: 'fork_session:error',
      message: 'Cancel the running task before branching',
    });
    return;
  }

  const projectSlug = context.currentProjectPath;
  const projectPath = slugToPath(projectSlug);
  const sessionsDir = getSessionsDir(projectSlug);
  const jsonlPath = join(sessionsDir, `${sessionId}.jsonl`);

  if (!existsSync(jsonlPath)) {
    send(ws, { type: 'fork_session:error', message: 'Session file not found' });
    return;
  }

  try {
    const raw = readFileSync(jsonlPath, 'utf-8');
    const lines = raw.split('\n');

    // Scan for the UUID of the last JSONL entry included in the fork.
    // lastUuid is updated on every parsed entry. When we see the (keepGlobalTurns+1)-th
    // user turn, we break — at that point lastUuid holds the UUID of the final response
    // in the last included turn, which is what upToMessageId expects.
    let userTurnCount = 0;
    let lastUuid = null;

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (isUserTurnLine(line)) {
          if (userTurnCount === keepGlobalTurns) break;
          userTurnCount++;
        }
        if (entry.uuid) lastUuid = entry.uuid;
      } catch {
        // skip malformed lines
      }
    }

    const result = await forkSession(sessionId, {
      dir: projectPath,
      ...(lastUuid && { upToMessageId: lastUuid }),
    });

    logger.info(
      `[fork-session] ${sessionId} → ${result.sessionId} (keepGlobalTurns: ${keepGlobalTurns})`,
    );

    send(ws, {
      type: 'fork_session:result',
      sourceSessionId: sessionId,
      newSessionId: result.sessionId,
    });
  } catch (err) {
    logger.error(`[fork-session] ${err.message}`);
    send(ws, {
      type: 'fork_session:error',
      message: `Fork failed: ${err.message}`,
    });
  }
}
