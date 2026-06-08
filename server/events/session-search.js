import { searchSessions } from '../lib/session-search.js';
import { send } from '../lib/ws.js';

// Per-connection in-flight AbortControllers, keyed by ws reference
const inflightSearches = new WeakMap();

export async function handler(ws, message, _context) {
  const { query, projectSlug, limit } = message;

  if (!query || typeof query !== 'string' || !query.trim()) {
    send(ws, {
      type: 'search:sessions:result',
      items: [],
      count: 0,
      truncated: false,
    });
    return;
  }

  // Cancel any in-flight search for this connection
  const prev = inflightSearches.get(ws);
  if (prev) prev.abort();

  const controller = new AbortController();
  inflightSearches.set(ws, controller);

  try {
    const result = await searchSessions(query.trim(), {
      projectSlug: projectSlug ?? null,
      limit: limit ?? 50,
      signal: controller.signal,
    });

    if (!controller.signal.aborted) {
      send(ws, { type: 'search:sessions:result', ...result });
    }
  } catch (err) {
    if (!controller.signal.aborted) {
      send(ws, {
        type: 'search:sessions:result',
        items: [],
        count: 0,
        truncated: false,
        error: err.message,
      });
    }
  } finally {
    if (inflightSearches.get(ws) === controller) {
      inflightSearches.delete(ws);
    }
  }
}
