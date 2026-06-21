import { isAuthDisabled, parseSessionCookie, validateSession } from './auth.js';

export function requireAuth(req, res, next) {
  if (isAuthDisabled()) return next();
  const token = parseSessionCookie(req.headers.cookie);
  if (!validateSession(token)) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}
