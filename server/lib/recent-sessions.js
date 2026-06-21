/**
 * Shared async implementation of recent-sessions scan.
 * Used by both the WS event handler and the HTTP v2 route so they stay in sync.
 */

import { createReadStream, existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { config, getProjectDisplayName, slugToPath } from '../config.js';
import { logger } from './logger.js';

async function readSessionTitle(jsonlPath) {
  try {
    // Read at most 64 KB — title entries always appear early in the file
    const stream = createReadStream(jsonlPath, {
      encoding: 'utf-8',
      end: 65535,
    });
    const rl = createInterface({
      input: stream,
      crlfDelay: Number.POSITIVE_INFINITY,
    });
    let aiTitle = null;
    let customTitle = null;
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const e = JSON.parse(trimmed);
        if (e.type === 'custom-title' && e.customTitle) {
          customTitle = e.customTitle;
        } else if (e.type === 'ai-title' && e.aiTitle && !aiTitle) {
          aiTitle = e.aiTitle;
        }
      } catch {
        /* skip malformed */
      }
    }
    return customTitle ?? aiTitle ?? null;
  } catch {
    return null;
  }
}

export async function getRecentSessions(limit = 50) {
  try {
    if (!existsSync(config.projectsDir)) return [];

    const entries = await readdir(config.projectsDir, { withFileTypes: true });
    const globalSessions = new Map();

    await Promise.all(
      entries
        .filter((e) => e.isDirectory())
        .map(async (entry) => {
          const projectSlug = entry.name;
          const sessionsDir = join(config.projectsDir, projectSlug);
          const indexPath = join(sessionsDir, 'sessions-index.json');
          const projectName = getProjectDisplayName(projectSlug);
          const projectPath = slugToPath(projectSlug);

          if (config.rootPath) {
            const rel = relative(
              resolve(config.rootPath),
              resolve(projectPath),
            );
            if (rel.startsWith('..')) return;
          }

          const sessionIds = new Set();

          if (existsSync(indexPath)) {
            try {
              const data = JSON.parse(await readFile(indexPath, 'utf-8'));
              await Promise.all(
                (data.entries || []).map(async (session) => {
                  sessionIds.add(session.sessionId);
                  const jsonlPath = join(
                    sessionsDir,
                    `${session.sessionId}.jsonl`,
                  );
                  let modified = session.modified;
                  let title = null;
                  if (existsSync(jsonlPath)) {
                    try {
                      const stats = await stat(jsonlPath);
                      modified = stats.mtime.toISOString();
                      title = await readSessionTitle(jsonlPath);
                    } catch {
                      /* use index values */
                    }
                  }
                  const sd = {
                    sessionId: session.sessionId,
                    projectSlug,
                    projectName,
                    projectPath,
                    firstPrompt:
                      session.firstPrompt?.substring(0, 100) || 'No prompt',
                    messageCount: session.messageCount || 0,
                    created: session.created,
                    modified,
                    title,
                  };
                  const existing = globalSessions.get(session.sessionId);
                  if (
                    !existing ||
                    new Date(modified) > new Date(existing.modified)
                  ) {
                    globalSessions.set(session.sessionId, sd);
                  }
                }),
              );
            } catch {
              /* malformed index — fall through to directory scan */
            }
          }

          try {
            const files = await readdir(sessionsDir);
            await Promise.all(
              files
                .filter((f) => f.endsWith('.jsonl') && !f.startsWith('agent-'))
                .map(async (file) => {
                  const sessionId = file.replace('.jsonl', '');
                  if (sessionIds.has(sessionId)) return;

                  const jsonlPath = join(sessionsDir, file);
                  try {
                    const stats = await stat(jsonlPath);
                    const content = await readFile(jsonlPath, 'utf-8');
                    const lines = content.split('\n').filter((l) => l.trim());
                    const messageCount = lines.length;
                    let firstPrompt = 'New session';
                    let aiTitle = null;
                    let customTitle = null;

                    for (const line of lines) {
                      try {
                        const e = JSON.parse(line);
                        if (e.type === 'custom-title' && e.customTitle) {
                          customTitle = e.customTitle;
                        } else if (e.type === 'ai-title' && e.aiTitle) {
                          aiTitle = e.aiTitle;
                        } else if (
                          firstPrompt === 'New session' &&
                          (e.type === 'user' || e.type === 'human') &&
                          e.message?.content
                        ) {
                          const text =
                            typeof e.message.content === 'string'
                              ? e.message.content
                              : Array.isArray(e.message.content)
                                ? e.message.content
                                    .filter((b) => b.type === 'text')
                                    .map((b) => b.text)
                                    .join(' ')
                                : '';
                          if (text.trim()) firstPrompt = text.substring(0, 100);
                        }
                      } catch {
                        /* skip malformed */
                      }
                    }

                    const modified = stats.mtime.toISOString();
                    const sd = {
                      sessionId,
                      projectSlug,
                      projectName,
                      projectPath,
                      firstPrompt,
                      messageCount,
                      created: stats.birthtime.toISOString(),
                      modified,
                      title: customTitle ?? aiTitle ?? null,
                    };
                    const existing = globalSessions.get(sessionId);
                    if (
                      !existing ||
                      new Date(modified) > new Date(existing.modified)
                    ) {
                      globalSessions.set(sessionId, sd);
                    }
                  } catch (err) {
                    logger.error(
                      `[recent-sessions] stat failed ${file}: ${err.message}`,
                    );
                  }
                }),
            );
          } catch {
            /* unreadable dir */
          }
        }),
    );

    return Array.from(globalSessions.values())
      .sort((a, b) => new Date(b.modified) - new Date(a.modified))
      .slice(0, limit);
  } catch (err) {
    logger.error(`[recent-sessions] failed: ${err.message}`);
    return [];
  }
}
