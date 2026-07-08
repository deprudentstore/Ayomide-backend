const jwt = require('jsonwebtoken');

/**
 * Verifies "Authorization: Bearer <token>" and attaches the decoded
 * payload to req.user. Use on any route that should only be reachable
 * by a logged-in admin.
 */
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, role, storeAccess }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
}

/**
 * Optional helper: restricts a route to admins who have access to the
 * store referenced in the request (query, params, or body). Superadmins
 * and admins with an empty storeAccess list can touch every store.
 */
function requireStoreAccess(getStoreSlug) {
  return (req, res, next) => {
    const slug = getStoreSlug(req);
    const { role, storeAccess } = req.user || {};
    if (role === 'superadmin' || !storeAccess || storeAccess.length === 0) return next();
    if (slug && storeAccess.includes(slug)) return next();
    return res.status(403).json({ error: 'You do not have access to this store.' });
  };
}

module.exports = auth;
module.exports.requireStoreAccess = requireStoreAccess;
