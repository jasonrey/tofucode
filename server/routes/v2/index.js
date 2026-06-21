import { Router } from 'express';
import { requireAuth } from '../../lib/api-auth.js';
import fsRouter from './fs.js';
import infoRouter from './info.js';
import projectsRouter from './projects.js';
import rcRouter from './rc.js';
import sessionsRouter from './sessions.js';

const router = Router();

// All v2 routes require authentication
router.use(requireAuth);

router.use('/info', infoRouter);
router.use('/projects', projectsRouter);

// sessionsRouter defines full paths (/sessions/recent, /sessions/search,
// /projects/:slug/sessions/:id, /projects/:slug/sessions/:id/older)
// so it mounts at root without an additional prefix.
router.use(sessionsRouter);

router.use('/rc', rcRouter);
router.use('/fs', fsRouter);

export default router;
