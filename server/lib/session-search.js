/**
 * Cross-session full-text search over all ~/.claude/projects JSONL files.
 *
 * No persistent index — streams each file line-by-line with readline.
 * This covers SDK/cron/agent sessions intentionally hidden by the native app.
 *
 * Search strategy:
 * - AND semantics: all query tokens must appear in a matching entry's text
 * - Case-insensitive
 * - Returns up to `limit` sessions, scanning at most `maxFilesScanned` files
 * - Files sorted newest-first (mtime) so most recent results surface first
 * - Per-session: captures up to MAX_SNIPPETS_PER_SESSION matching snippets
 */

import { createReadStream, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline';
import { getProjectDisplayName } from '../config.js';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const MAX_SNIPPETS_PER_SESSION = 3;
const SNIPPET_RADIUS = 100; // chars either side of first token match

/** True when query looks like a UUID fragment (all hex + dashes, at least 8 chars). */
function looksLikeSessionId(q) {
  return /^[0-9a-f-]+$/i.test(q) && q.length >= 8;
}

/** Extract plaintext from a JSONL entry. Returns empty string if non-text. */
function extractText(entry) {
  if (entry.type === 'user' || entry.type === 'human') {
    const content = entry.message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join(' ');
    }
  }
  if (entry.type === 'assistant') {
    const blocks = entry.message?.content || [];
    return blocks
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join(' ');
  }
  return '';
}

/**
 * Build a centred snippet: find the first token, then take SNIPPET_RADIUS chars
 * either side and trim to clean word boundaries.
 */
function makeSnippet(text, tokens) {
  const lower = text.toLowerCase();
  let pos = -1;
  for (const t of tokens) {
    const idx = lower.indexOf(t);
    if (idx !== -1 && (pos === -1 || idx < pos)) pos = idx;
  }
  if (pos === -1) return text.slice(0, 200);
  const start = Math.max(0, pos - SNIPPET_RADIUS);
  const end = Math.min(text.length, pos + SNIPPET_RADIUS);
  const raw = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return (start > 0 ? '…' : '') + raw + (end < text.length ? '…' : '');
}

/**
 * Collect all JSONL files under PROJECTS_DIR, optionally filtered to one project slug.
 * Returns [{filePath, projectSlug, sessionId}] sorted by mtime desc.
 */
function collectFiles(projectSlugFilter) {
  const results = [];
  let slugDirs;
  try {
    slugDirs = readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return results;
  }

  for (const slug of slugDirs) {
    if (projectSlugFilter && slug !== projectSlugFilter) continue;
    const slugDir = join(PROJECTS_DIR, slug);
    let files;
    try {
      files = readdirSync(slugDir).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const file of files) {
      const filePath = join(slugDir, file);
      try {
        const mtime = statSync(filePath).mtimeMs;
        results.push({
          filePath,
          projectSlug: slug,
          sessionId: basename(file, '.jsonl'),
          mtime,
        });
      } catch {
        // skip unreadable
      }
    }
  }

  results.sort((a, b) => b.mtime - a.mtime);
  return results;
}

/**
 * Search a single JSONL file for entries matching all tokens.
 * Returns an array of snippet strings (up to MAX_SNIPPETS_PER_SESSION).
 */
async function searchFile(filePath, tokens) {
  return new Promise((resolve) => {
    const snippets = [];
    let latestTimestamp = null;
    let nativeTitle = null;

    const rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Number.POSITIVE_INFINITY,
    });

    rl.on('line', (line) => {
      if (!line.trim()) return;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        return;
      }

      if (entry.type === 'custom-title' && entry.customTitle) {
        nativeTitle = entry.customTitle;
        return;
      }
      if (entry.type === 'ai-title' && entry.aiTitle) {
        if (!nativeTitle) nativeTitle = entry.aiTitle; // custom-title takes priority
        return;
      }

      const text = extractText(entry);
      if (!text) return;

      const lower = text.toLowerCase();
      if (!tokens.every((t) => lower.includes(t))) return;

      // Update timestamp on every match so we capture the most recent one
      if (entry.timestamp) latestTimestamp = entry.timestamp;
      if (snippets.length < MAX_SNIPPETS_PER_SESSION) {
        snippets.push(makeSnippet(text, tokens));
      }
    });

    rl.on('close', () => resolve({ snippets, latestTimestamp, nativeTitle }));
    rl.on('error', () =>
      resolve({ snippets: [], latestTimestamp: null, nativeTitle: null }),
    );
  });
}

/** Read session title from a JSONL file (custom-title > ai-title). */
async function readTitle(filePath) {
  return new Promise((resolve) => {
    let customTitle = null;
    let aiTitle = null;
    const rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Number.POSITIVE_INFINITY,
    });
    rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const e = JSON.parse(line);
        if (e.type === 'custom-title' && e.customTitle)
          customTitle = e.customTitle;
        else if (e.type === 'ai-title' && e.aiTitle && !aiTitle)
          aiTitle = e.aiTitle;
      } catch {}
    });
    rl.on('close', () => resolve(customTitle ?? aiTitle ?? null));
    rl.on('error', () => resolve(null));
  });
}

/** Match files by session ID prefix (with or without dashes). */
async function searchBySessionId(query, files, limit, signal) {
  const q = query.toLowerCase().replace(/-/g, '');
  const matched = files.filter(({ sessionId }) =>
    sessionId.replace(/-/g, '').startsWith(q),
  );

  const items = [];
  for (const { filePath, projectSlug: slug, sessionId } of matched.slice(
    0,
    limit,
  )) {
    if (signal?.aborted) break;
    const title = await readTitle(filePath);
    items.push({
      sessionId,
      projectSlug: slug,
      projectName: getProjectDisplayName(slug),
      title,
      snippets: [],
      timestamp: null,
      matchCount: 1,
    });
  }
  return { items, count: items.length, truncated: matched.length > limit };
}

/**
 * Search all sessions for the given query.
 *
 * @param {string} query
 * @param {object} opts
 * @param {string|null}  [opts.projectSlug]      filter to one project
 * @param {number}       [opts.limit=50]          max sessions returned
 * @param {number}       [opts.maxFilesScanned=2000]
 * @param {AbortSignal}  [opts.signal]
 *
 * @returns {Promise<{items: Array, count: number, truncated: boolean}>}
 */
export async function searchSessions(
  query,
  { projectSlug = null, limit = 50, maxFilesScanned = 2000, signal } = {},
) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);

  if (!tokens.length) return { items: [], count: 0, truncated: false };

  const files = collectFiles(projectSlug);

  if (tokens.length === 1 && looksLikeSessionId(tokens[0])) {
    return searchBySessionId(tokens[0], files, limit, signal);
  }
  const items = [];
  let scanned = 0;
  let truncated = false;

  for (const { filePath, projectSlug: slug, sessionId } of files) {
    if (signal?.aborted) break;
    if (scanned >= maxFilesScanned || items.length >= limit) {
      truncated = true;
      break;
    }
    scanned++;

    const {
      snippets,
      latestTimestamp,
      nativeTitle: title,
    } = await searchFile(filePath, tokens);
    if (!snippets.length) continue;

    const projectName = getProjectDisplayName(slug);

    items.push({
      sessionId,
      projectSlug: slug,
      projectName,
      title,
      snippets,
      timestamp: latestTimestamp,
      matchCount: snippets.length,
    });
  }

  return { items, count: items.length, truncated };
}
