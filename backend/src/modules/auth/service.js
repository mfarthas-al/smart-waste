const User = require('../../models/User');

function mapUser(userDoc) {
  return {
    id: userDoc.id,
    email: userDoc.email,
    name: userDoc.name,
    role: userDoc.role,
  };
}

async function authenticate(email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) return null;

  const passwordOk = await user.verifyPassword(password);
  if (!passwordOk) return null;

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
