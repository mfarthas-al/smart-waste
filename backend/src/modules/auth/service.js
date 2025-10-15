const User = require('../../models/User');

function mapUser(userDoc) {
  return {
    id: userDoc.id,
    email: userDoc.email,
    name: userDoc.name,
    role: userDoc.role,
  };
}

const MAX_FAILED_ATTEMPTS = 3;
const LOCK_DURATION_MINUTES = 15;

async function authenticate(email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) return null;

  const now = new Date();
  if (user.lockUntil && user.lockUntil > now) {
    const error = new Error('Too many failed attempts. Please try again later.');
    error.code = 'ACCOUNT_LOCKED';
    error.lockUntil = user.lockUntil;
    throw error;
  }

  if (user.lockUntil && user.lockUntil <= now) {
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();
  }

  if (!user.isActive) {
    const error = new Error('This account is not active. Please contact support.');
    error.code = 'ACCOUNT_INACTIVE';
    throw error;
  }

  const passwordOk = await user.verifyPassword(password);
  if (!passwordOk) {
    const lockedUntil = await user.registerFailedLogin(MAX_FAILED_ATTEMPTS, LOCK_DURATION_MINUTES);
    if (lockedUntil) {
      const error = new Error('Account locked due to repeated failed attempts.');
      error.code = 'ACCOUNT_LOCKED';
      error.lockUntil = lockedUntil;
      throw error;
    }
    return null;
  }

  await user.resetLoginAttempts();

  return mapUser(user);
}

async function createUser({ name, email, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    const error = new Error('An account already exists for this email');
    error.code = 'EMAIL_TAKEN';
    throw error;
  }

  const passwordHash = await User.hashPassword(password);
  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    role: 'regular',
  });

  return mapUser(user);
}

async function findUserByEmail(email) {
  return User.findOne({ email: email.trim().toLowerCase() });
}

module.exports = {
  authenticate,
  createUser,
  findUserByEmail,
};
