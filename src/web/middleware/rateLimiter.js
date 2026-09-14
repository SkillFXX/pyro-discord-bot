const rateLimit = require('express-rate-limit');

// Login rate limiting map for brute-force protection (max 5 failed attempts per 15 minutes)
const loginAttempts = new Map();

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const attempt = loginAttempts.get(ip);
  if (attempt) {
    if (attempt.lockedUntil && now < attempt.lockedUntil) {
      const remainingMins = Math.ceil((attempt.lockedUntil - now) / 60000);
      return `Trop de tentatives. Veuillez patienter ${remainingMins} minute(s).`;
    }
    if (attempt.lockedUntil && now >= attempt.lockedUntil) {
      loginAttempts.delete(ip);
    }
  }
  return null;
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const attempt = loginAttempts.get(ip) || { count: 0, lockedUntil: null };
  attempt.count += 1;
  if (attempt.count >= 5) {
    attempt.lockedUntil = now + 15 * 60 * 1000;
  }
  loginAttempts.set(ip, attempt);
}

function clearLoginAttempts(ip) {
  loginAttempts.delete(ip);
}

// Express Rate Limiters (fixes CodeQL alert: Missing rate limiting)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Trop de tentatives de connexion depuis cette adresse IP. Veuillez réessayer dans 15 minutes.',
  handler: (req, res) => {
    return res.status(429).json({
      error: 'Trop de tentatives de connexion depuis cette adresse IP. Veuillez réessayer dans 15 minutes.'
    });
  }
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 150, // 150 requests per minute
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  loginAttempts,
  checkLoginRateLimit,
  recordFailedLogin,
  clearLoginAttempts,
  loginLimiter,
  apiLimiter
};

