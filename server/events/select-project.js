/**
 * Event: select_project
 *
 * Selects a project and returns its sessions list.
 * Sets the current project context for subsequent operations.
 *
 * @event select_project
 * @param {Object} message - { path: string } - Project slug
 * @returns {void} Sends: { type: 'project_selected', path, project, sessions }
 *
 * @example
 * // Request
 * { type: 'select_project', path: '-home-ts-projects-foo' }
 *
 * // Response
 * {
 *   type: 'project_selected',
 *   path: '-home-ts-projects-foo',
 *   project: { slug, name, path, sessionCount, lastModified },
 *   sessions: [...]
 * }
 */

import path from 'node:path';
import { config, getProjectDisplayName, slugToPath } from '../config.js';
import { getProjectsList } from '../lib/projects.js';
import { getAllTitles } from '../lib/session-titles.js';
import { getSessionsList } from '../lib/sessions.js';
import { send } from '../lib/ws.js';

export async function handler(ws, message, context) {
  const projectSlug = message.path;

  if (!projectSlug || typeof projectSlug !== 'string') {
    send(ws, { type: 'error', message: 'Project path is required' });
    return;
  }

  // SECURITY: Validate that the project path is within root (if --root is set)
  if (config.rootPath) {
    const projectPath = slugToPath(projectSlug);
    const resolvedProject = path.resolve(projectPath);
    const resolvedRoot = path.resolve(config.rootPath);
    const relativePath = path.relative(resolvedRoot, resolvedProject);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      send(ws, {
        type: 'error',
        message: `Access denied: project outside root (${config.rootPath})`,
      });
      return;
    }
  }

  // Update project path. Do NOT touch currentSessionId or watcher registration here.
  // select_session (always sent immediately after select_project) is responsible for
  // unregistering the old session and registering the new one. Clearing the session
  // here creates a race: ws is removed from the watcher set before select_session has
  // a chance to re-register it, causing broadcastToSession to silently drop messages
  // sent in the transition window (e.g. the user message echo at prompt start).
  context.currentProjectPath = projectSlug;

  // Find project info or create basic info from slug
  const allProjects = await getProjectsList();
  const projectInfo = allProjects.find((p) => p.slug === projectSlug) || {
    slug: projectSlug,
    name: getProjectDisplayName(projectSlug),
    path: slugToPath(projectSlug),
  };

  // Get sessions and enrich with custom titles
  const sessions = await getSessionsList(projectSlug);
  const titles = getAllTitles(projectSlug);
  const enrichedSessions = sessions.map((session) => ({
    ...session,
    title: titles[session.sessionId] || null,
  }));

  send(ws, {
    type: 'project_selected',
    path: projectSlug,
    project: projectInfo,
    sessions: enrichedSessions,
  });
}
