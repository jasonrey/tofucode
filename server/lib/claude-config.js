/**
 * Minimal read/write access to ~/.claude.json — claude's own global config.
 *
 * We touch exactly one thing: the per-project workspace-trust flag. On the
 * first run in any directory, claude shows a blocking "Is this a project you
 * trust?" prompt. `--dangerously-skip-permissions` does NOT skip it, so a
 * detached tmux pane parks at that prompt forever, never writes a registry
 * entry, and the spawn times out. Pre-seeding the flag is what makes the
 * folder-browser launcher work on directories claude has never opened.
 *
 * The gate is the presence of a `projects[cwd]` entry with
 * `hasTrustDialogAccepted: true` — claude leaves the flag false on plenty of
 * existing entries without re-prompting, so absence of the entry is the real
 * trigger.
 */

import {
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { logger } from './logger.js';

const CONFIG_PATH = join(homedir(), '.claude.json');

/**
 * Mark `cwd` as a trusted workspace so claude won't prompt on first launch.
 *
 * Writes ONLY when the path has no entry at all. claude runs happily in
 * projects whose `hasTrustDialogAccepted` is still false — it's the missing
 * entry that triggers the prompt — so flipping that flag on an existing entry
 * would be a pointless mutation, and would silently override a deliberate
 * "No, exit" from an earlier run. claude owns this file and rewrites it every
 * session, so every write we skip is one less chance to clobber its own.
 *
 * @param {string} cwd Absolute directory path
 * @returns {'already-known'|'granted'|'skipped'}
 */
export function ensureProjectTrusted(cwd) {
  if (!cwd || !existsSync(CONFIG_PATH)) return 'skipped';

  let config;
  let raw;
  try {
    raw = readFileSync(CONFIG_PATH, 'utf8');
    config = JSON.parse(raw);
  } catch (err) {
    // Never clobber a file we couldn't parse — claude may be mid-write.
    logger.error(`[claude-config] unreadable ~/.claude.json: ${err.message}`);
    return 'skipped';
  }

  if (!config || typeof config !== 'object') return 'skipped';
  if (!config.projects || typeof config.projects !== 'object') {
    config.projects = {};
  }

  // Entry already present → claude won't prompt, whatever the flag says.
  if (config.projects[cwd]) return 'already-known';

  // Shape mirrors what claude writes for a fresh project; it fills the rest
  // (usage counters, timestamps) itself on first run.
  config.projects[cwd] = {
    allowedTools: [],
    mcpContextUris: [],
    mcpServers: {},
    enabledMcpjsonServers: [],
    disabledMcpjsonServers: [],
    hasTrustDialogAccepted: true,
  };

  const tmpPath = `${CONFIG_PATH}.tofucode.tmp`;
  try {
    // Atomic replace so a crash mid-write can't truncate claude's config.
    writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf8');
    renameSync(tmpPath, CONFIG_PATH);
    logger.info(`[claude-config] granted workspace trust for ${cwd}`);
    return 'granted';
  } catch (err) {
    logger.error(`[claude-config] failed to grant trust: ${err.message}`);
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      // best-effort cleanup
    }
    return 'skipped';
  }
}
