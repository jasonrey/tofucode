import { Router } from 'express';
import { startSession, stopSession } from '../../lib/rc-launcher.js';
import { listLiveSessions } from '../../lib/session-registry.js';

const router = Router();

// GET /rc/sessions — list live sessions
router.get('/sessions', (_req, res) => {
  res.json({ sessions: listLiveSessions() });
});

// POST /rc/sessions — start or resume a session
router.post('/sessions', async (req, res) => {
  const {
    projectSlug,
    sessionId,
    name,
    model,
    allowFallbackToNew = false,
  } = req.body;

  if (!projectSlug) {
    return res.status(400).json({ error: 'projectSlug is required' });
  }

  const result = await startSession({
    projectSlug,
    sessionId,
    name,
    model,
    allowFallbackToNew,
    skipPermissions: true,
  });

  // Include projectSlug in result for frontend convenience
  res.json({ ...result, projectSlug });
});

// DELETE /rc/sessions/by-session/:sessionId — stop by session UUID
router.delete('/sessions/by-session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const result = await stopSession({ sessionId });
  res.json(result);
});

// DELETE /rc/sessions/:pid — stop by PID
router.delete('/sessions/:pid', async (req, res) => {
  if (!/^\d+$/.test(req.params.pid)) {
    return res.status(400).json({ error: 'pid must be a positive integer' });
  }
  const pid = Number.parseInt(req.params.pid, 10);
  if (!pid) {
    return res.status(400).json({ error: 'pid must be a positive integer' });
  }
  const result = await stopSession({ pid });
  res.json(result);
});

export default router;
