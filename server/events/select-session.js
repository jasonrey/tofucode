import { isValidSessionId, loadSessionHistory } from '../lib/sessions.js';
import {
  broadcast,
  getSessionWatcherCount,
  send,
  unwatchSession,
  watchSession,
} from '../lib/ws.js';

export async function handler(ws, message, context) {
  const sessionId = message.sessionId;

  if (!sessionId || typeof sessionId !== 'string') {
    send(ws, { type: 'error', message: 'Session ID is required' });
    return;
  }

  if (!isValidSessionId(sessionId)) {
    send(ws, { type: 'error', message: 'Invalid sessionId format' });
    return;
  }

  const otherWatchers = getSessionWatcherCount(sessionId, ws);
  const isActiveElsewhere = otherWatchers > 0;

  if (context.currentSessionId && context.currentSessionId !== sessionId) {
    unwatchSession(context.currentSessionId, ws);
  }
  context.currentSessionId = sessionId;
  watchSession(sessionId, ws);

  let history = [];
  let hasOlderMessages = false;
  let summaryCount = 0;
  let totalEntries = 0;
  let totalTurns = 0;
  let loadedTurns = 0;
  let effectiveOffset = 0;
  const offset = message.offset || 0;

  if (context.currentProjectPath && sessionId) {
    try {
      const fullHistory = message.fullHistory || false;
      const loadLastTurn = message.loadLastTurn !== false;
      const result = await loadSessionHistory(
        context.currentProjectPath,
        sessionId,
        { fullHistory, offset, loadLastTurn },
      );
      history = result.messages;
      hasOlderMessages = result.hasOlderMessages;
      summaryCount = result.summaryCount;
      totalEntries = result.totalEntries;
      totalTurns = result.totalTurns || 0;
      loadedTurns = result.loadedTurns || 0;
      effectiveOffset = result.effectiveOffset || 0;
    } catch (err) {
      send(ws, {
        type: 'error',
        sessionId,
        message: `Failed to load session history: ${err.message}`,
      });
      return;
    }
  }

  send(ws, {
    type: 'session_selected',
    sessionId,
    projectPath: context.currentProjectPath,
    isActiveElsewhere,
  });

  send(ws, {
    type: 'session_history',
    sessionId,
    messages: history,
    hasOlderMessages,
    summaryCount,
    totalEntries,
    totalTurns,
    loadedTurns,
    offset: effectiveOffset,
  });

  broadcast({
    type: 'session_opened',
    sessionId,
  });
}
