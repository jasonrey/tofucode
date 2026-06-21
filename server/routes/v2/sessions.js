import { Router } from 'express';
import { logger } from '../../lib/logger.js';
import { getRecentSessions } from '../../lib/recent-sessions.js';
import { searchSessions } from '../../lib/session-search.js';
import { isValidSessionId, loadSessionHistory } from '../../lib/sessions.js';

const router = Router();
const SLUG_RE = /^-[a-zA-Z0-9_.-]+$/;

// ── GET /sessions/recent ───────────────────────────────────────────────────

router.get('/sessions/recent', async (req, res) => {
  const rawLimit = Number.parseInt(req.query.limit, 10) || 50;
  const limit = Math.max(1, Math.min(rawLimit, 200));
  try {
    const sessions = await getRecentSessions(limit);
    res.json({ sessions });
  } catch (err) {
    logger.error(`[v2/sessions] recent failed: ${err.message}`);
    res.json({ sessions: [] });
  }
});

// ── GET /sessions/search ───────────────────────────────────────────────────

router.get('/sessions/search', async (req, res) => {
  const { q, projectSlug, limit: rawLimit } = req.query;

  if (!q || !q.trim()) {
    return res.json({ items: [], count: 0, truncated: false });
  }

  const limit = Math.max(1, Math.min(Number.parseInt(rawLimit, 10) || 50, 200));

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  try {
    const result = await searchSessions(q.trim(), {
      projectSlug: projectSlug ?? null,
      limit,
      signal: controller.signal,
    });
    res.json(result);
  } catch (err) {
    if (err.name === 'AbortError') return;
    logger.error(`[v2/sessions] search failed: ${err.message}`);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ── GET /projects/:projectSlug/sessions/:sessionId ─────────────────────────

router.get('/projects/:projectSlug/sessions/:sessionId', async (req, res) => {
  const { projectSlug, sessionId } = req.params;

  if (!SLUG_RE.test(projectSlug)) {
    return res.status(400).json({ error: 'Invalid projectSlug format' });
  }
  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({ error: 'Invalid sessionId format' });
  }

  const fullHistory = req.query.fullHistory === 'true';
  const offset = Number.parseInt(req.query.offset, 10) || 0;
  const loadLastTurn = req.query.loadLastTurn !== 'false';

  try {
    const result = await loadSessionHistory(projectSlug, sessionId, {
      fullHistory,
      offset,
      loadLastTurn,
    });
    res.json({
      sessionId,
      messages: result.messages,
      hasOlderMessages: result.hasOlderMessages,
      summaryCount: result.summaryCount,
      totalEntries: result.totalEntries,
      totalTurns: result.totalTurns,
      loadedTurns: result.loadedTurns,
      offset: result.effectiveOffset ?? offset,
    });
  } catch (err) {
    logger.error(`[v2/sessions] history failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to load session history' });
  }
});

// ── GET /projects/:projectSlug/sessions/:sessionId/older ───────────────────

router.get(
  '/projects/:projectSlug/sessions/:sessionId/older',
  async (req, res) => {
    const { projectSlug, sessionId } = req.params;

    if (!SLUG_RE.test(projectSlug)) {
      return res.status(400).json({ error: 'Invalid projectSlug format' });
    }
    if (!isValidSessionId(sessionId)) {
      return res.status(400).json({ error: 'Invalid sessionId format' });
    }

    const offset = Number.parseInt(req.query.offset, 10);
    if (Number.isNaN(offset)) {
      return res.status(400).json({ error: 'offset is required' });
    }
    const turnLimit = Number.parseInt(req.query.turnLimit, 10) || 5;

    try {
      const result = await loadSessionHistory(projectSlug, sessionId, {
        offset,
        turnLimit,
      });
      res.json({
        sessionId,
        messages: result.messages,
        hasOlderMessages: result.hasOlderMessages,
        totalTurns: result.totalTurns,
        loadedTurns: result.loadedTurns,
        offset: result.effectiveOffset ?? offset,
      });
    } catch (err) {
      logger.error(`[v2/sessions] older failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to load older messages' });
    }
  },
);

export default router;
