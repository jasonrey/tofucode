import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { pathToSlug } from '../config.js';
import { send } from '../lib/ws.js';

const HOME = homedir();

export async function handler(ws, message, _context) {
  const { parentPath, name } = message;

  if (!parentPath || !name) {
    send(ws, {
      type: 'project:create:result',
      status: 'failed',
      message: 'parentPath and name are required',
    });
    return;
  }

  // Name validation: no path separators or null bytes
  if (/[/\\\0]/.test(name)) {
    send(ws, {
      type: 'project:create:result',
      status: 'failed',
      message: 'Invalid project name',
    });
    return;
  }

  // Security: parentPath must be under homedir (resolve handles relative paths and ..)
  const resolvedParent = resolve(parentPath);
  if (resolvedParent !== HOME && !resolvedParent.startsWith(`${HOME}/`)) {
    send(ws, {
      type: 'project:create:result',
      status: 'failed',
      message: 'parentPath must be under home directory',
    });
    return;
  }

  if (!existsSync(resolvedParent)) {
    send(ws, {
      type: 'project:create:result',
      status: 'failed',
      message: 'parentPath does not exist',
    });
    return;
  }

  const newPath = resolve(resolvedParent, name);
  if (existsSync(newPath)) {
    send(ws, {
      type: 'project:create:result',
      status: 'failed',
      message: 'Directory already exists',
    });
    return;
  }

  try {
    await mkdir(newPath, { recursive: false });
    const projectSlug = pathToSlug(newPath);
    send(ws, {
      type: 'project:create:result',
      status: 'ok',
      projectSlug,
      path: newPath,
    });
  } catch (err) {
    send(ws, {
      type: 'project:create:result',
      status: 'failed',
      message: err.message,
    });
  }
}
