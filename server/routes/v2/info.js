import { homedir } from 'node:os';
import { Router } from 'express';
import { config } from '../../config.js';
import {
  getCurrentVersion,
  getLatestVersion,
  isNewerVersion,
} from '../../lib/version-checker.js';

const router = Router();
const PACKAGE_NAME = 'tofucode';

router.get('/', (_req, res) => {
  const current = getCurrentVersion();
  const latest = getLatestVersion();

  const body = {
    version: current,
    homePath: homedir(),
    rootPath: config.rootPath ?? null,
  };

  if (latest && isNewerVersion(latest, current)) {
    body.updateAvailable = {
      currentVersion: current,
      latestVersion: latest,
      updateUrl: `https://www.npmjs.com/package/${PACKAGE_NAME}`,
    };
  }

  res.json(body);
});

export default router;
