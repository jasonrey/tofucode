import { Router } from 'express';
import { browseFolderContents } from '../../lib/folders.js';

const router = Router();

router.get('/browse', (req, res) => {
  const { path: browsePath } = req.query;
  const result = browseFolderContents(browsePath ?? null);
  res.json({ path: result.path, contents: result.contents });
});

export default router;
