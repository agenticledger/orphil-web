const crypto = require('crypto');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Generate a token from the password (deterministic per-process secret)
const PROCESS_SECRET = crypto.randomBytes(32).toString('hex');

function generateToken() {
  return crypto.createHmac('sha256', PROCESS_SECRET)
    .update(ADMIN_PASSWORD)
    .digest('hex');
}

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-key'];
  if (!token || token !== generateToken()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = { requireAdmin, generateToken, ADMIN_PASSWORD };
