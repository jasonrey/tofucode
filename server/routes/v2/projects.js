import {
  existsSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { Router } from 'express';
import {
  config,
  getProjectDisplayName,
  getSessionsDir,
  pathToSlug,
  slugToPath,
} from '../../config.js';
import { getProjectsList } from '../../lib/projects.js';
import { getSessionsList, isValidSessionId } from '../../lib/sessions.js';

const HOME = homedir();
const SLUG_RE = /^-[a-zA-Z0-9_.-]+$/;

const router = Router();

// Validate projectSlug format to prevent path traversal
function validateSlug(slug, res) {
  if (!slug || !SLUG_RE.test(slug)) {
    res.status(400).json({ error: 'Invalid projectSlug format' });
    return false;
  }
  return true;
}

// Check rootPath restriction
function checkRootPath(projectSlug, res) {
  if (!config.rootPath) return true;
  const projectPath = slugToPath(projectSlug);
  const resolvedProject = path.resolve(projectPath);
  const resolvedRoot = path.resolve(config.rootPath);
  const relativePath = path.relative(resolvedRoot, resolvedProject);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    res.status(403).json({
      error: `Access denied: project outside root (${config.rootPath})`,
    });
    return false;
  }
  return true;
}

// GET /projects
router.get('/', async (_req, res) => {
  const projects = await getProjectsList();
  res.json({ projects });
});

// POST /projects
router.post('/', async (req, res) => {
  const { parentPath, name } = req.body;

  if (!parentPath || !name) {
    return res.status(400).json({ error: 'parentPath and name are required' });
  }
  if (/[/\\\0]/.test(name)) {
    return res.status(400).json({ error: 'Invalid project name' });
  }

  const resolvedParent = path.resolve(parentPath);
  if (resolvedParent !== HOME && !resolvedParent.startsWith(`${HOME}/`)) {
    return res
      .status(400)
      .json({ error: 'parentPath must be under home directory' });
  }
  if (!existsSync(resolvedParent)) {
    return res.status(400).json({ error: 'parentPath does not exist' });
  }

  const newPath = path.resolve(resolvedParent, name);
  if (existsSync(newPath)) {
    return res.status(400).json({ error: 'Directory already exists' });
  }

  try {
    await mkdir(newPath, { recursive: false });
    const projectSlug = pathToSlug(newPath);
    res.status(201).json({ projectSlug, path: newPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /projects/:projectSlug/sessions
router.get('/:projectSlug/sessions', async (req, res) => {
  const { projectSlug } = req.params;
  if (!validateSlug(projectSlug, res)) return;
  if (!checkRootPath(projectSlug, res)) return;

  const allProjects = await getProjectsList();
  const project = allProjects.find((p) => p.slug === projectSlug) ?? {
    slug: projectSlug,
    name: getProjectDisplayName(projectSlug),
    path: slugToPath(projectSlug),
    sessionCount: 0,
    lastModified: null,
  };

  const sessions = await getSessionsList(projectSlug);
  res.json({ project, sessions });
});

// DELETE /projects/:projectSlug/sessions/:sessionId
router.delete('/:projectSlug/sessions/:sessionId', (req, res) => {
  const { projectSlug, sessionId } = req.params;
  if (!validateSlug(projectSlug, res)) return;
  if (!checkRootPath(projectSlug, res)) return;
  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({ error: 'Invalid sessionId format' });
  }

  const sessionsDir = getSessionsDir(projectSlug);
  const jsonlPath = path.join(sessionsDir, `${sessionId}.jsonl`);
  const sessionDir = path.join(sessionsDir, sessionId);
  const indexPath = path.join(sessionsDir, 'sessions-index.json');

  if (!existsSync(jsonlPath)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  try {
    unlinkSync(jsonlPath);

    if (existsSync(sessionDir)) {
      rmSync(sessionDir, { recursive: true, force: true });
    }

    if (existsSync(indexPath)) {
      const indexData = JSON.parse(readFileSync(indexPath, 'utf-8'));
      indexData.entries = (indexData.entries || []).filter(
        (e) => e.sessionId !== sessionId,
      );
      writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
    }

    const draftsPath = path.join(sessionsDir, '.drafts.json');
    if (existsSync(draftsPath)) {
      try {
        const drafts = JSON.parse(readFileSync(draftsPath, 'utf-8'));
        if (drafts[sessionId]) {
          delete drafts[sessionId];
          writeFileSync(draftsPath, JSON.stringify(drafts, null, 2));
        }
      } catch {
        // drafts cleanup is best-effort
      }
    }

    res.json({ sessionId });
  } catch (_err) {
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

export default router;
