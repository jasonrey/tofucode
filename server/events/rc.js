import { startSession, stopSession } from '../lib/rc-launcher.js';
import { listLiveSessions } from '../lib/session-registry.js';
import { send } from '../lib/ws.js';

export async function listHandler(ws, _message, _context) {
  const sessions = listLiveSessions();
  send(ws, { type: 'rc:list:result', sessions });
}

export async function startHandler(ws, message, _context) {
  const {
    projectSlug,
    sessionId,
    name,
    model,
    allowFallbackToNew,
    skipPermissions,
  } = message;
  if (!projectSlug) {
    send(ws, {
      type: 'rc:start:result',
      status: 'failed',
      message: 'projectSlug is required',
    });
    return;
  }

  const result = await startSession({
    projectSlug,
    sessionId,
    name,
    model,
    allowFallbackToNew: allowFallbackToNew ?? false,
    skipPermissions: skipPermissions ?? true,
  });
  send(ws, { type: 'rc:start:result', ...result });
}

export async function stopHandler(ws, message, _context) {
  const { pid, sessionId } = message;
  if (!pid && !sessionId) {
    send(ws, {
      type: 'rc:stop:result',
      status: 'not_found',
      message: 'pid or sessionId required',
    });
    return;
  }

  const result = await stopSession({ pid, sessionId });
  send(ws, { type: 'rc:stop:result', ...result });
}
