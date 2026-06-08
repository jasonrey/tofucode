/**
 * Convert a filesystem path to a project slug.
 * MIRRORS server/config.js pathToSlug EXACTLY — slashes AND dots become dashes.
 * e.g. /home/ts/projects/picotofu.com → -home-ts-projects-picotofu-com
 */
export function pathToSlug(projectPath) {
  return `-${projectPath.replace(/[/.]/g, '-').replace(/^-/, '')}`;
}

/**
 * Build the claude.ai remote-control URL for a live RC session.
 * Only meaningful while the bridge is connected (rcActive).
 */
export function claudeUrl(bridgeSessionId) {
  return `https://claude.ai/code/${bridgeSessionId}`;
}
