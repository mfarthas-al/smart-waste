const User = require('../../models/User');

async function authenticate(email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) return null;

  const passwordOk = await user.verifyPassword(password);
  if (!passwordOk) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

async function findUserByEmail(email) {
  return User.findOne({ email: email.trim().toLowerCase() });
}

module.exports = {
  authenticate,
  findUserByEmail,
};
