/**
 * Event: compact_session
 *
 * Triggers a manual conversation compaction by sending /compact to the SDK.
 * Only runs when the session is idle — rejected if a task is already running.
 *
 * @event compact_session
 * @param {Object} message - {}
 * @returns {void} Streams the same events as a regular prompt
 *
 * @example
 * // Request
 * { type: 'compact_session' }
 */

import { getOrCreateTask } from '../lib/tasks.js';
import { send } from '../lib/ws.js';
import { executePrompt } from './prompt.js';

export async function handler(ws, _message, context) {
  if (!context.currentProjectPath) {
    send(ws, { type: 'error', message: 'No project selected' });
    return;
  }

  if (!context.currentSessionId) {
    send(ws, { type: 'error', message: 'No session selected' });
    return;
  }

  const task = getOrCreateTask(context.currentSessionId);
  if (task.status === 'running') {
    send(ws, {
      type: 'error',
      message: 'Cannot compact while a task is running',
    });
    return;
  }

  // executePrompt returns taskSessionId. For an existing session /compact is a
  // local SDK command — the session ID does not change from the caller's perspective,
  // so the return value is the same as context.currentSessionId. No reassignment needed.
  await executePrompt(
    ws,
    context.currentProjectPath,
    context.currentSessionId,
    '/compact',
    {},
  );
}
