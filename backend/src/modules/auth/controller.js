const { z } = require('zod');
const authService = require('./service');

const loginSchema = z.object({
  email: z.string({ required_error: 'Email is required' }).email('Enter a valid email'),
  password: z.string({ required_error: 'Password is required' }).min(6, 'Password must be at least 6 characters'),
});

const registerSchema = z.object({
  name: z.string({ required_error: 'Name is required' }).min(2, 'Name must be at least 2 characters').max(80, 'Name is too long'),
  email: z.string({ required_error: 'Email is required' }).email('Enter a valid email'),
  password: z.string({ required_error: 'Password is required' }).min(8, 'Password must be at least 8 characters'),
});

async function login(req, res, next) {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await authService.authenticate(email, password);

    if (!user) {
      return res.status(401).json({ ok: false, message: 'Invalid email or password' });
    }

    return res.json({
      ok: true,
      message: `Welcome back, ${user.name}`,
      user,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, message: error.errors[0].message });
    }
    if (error.code === 'ACCOUNT_INACTIVE') {
      return res.status(403).json({ ok: false, message: error.message });
    }
    return next(error);
  }
}

async function register(req, res, next) {
  try {
    const payload = registerSchema.parse(req.body);
    const user = await authService.createUser(payload);

    return res.status(201).json({
      ok: true,
      message: 'Account created. You are now signed in.',
      user,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, message: error.errors[0].message });
    }
    if (error.code === 'EMAIL_TAKEN') {
      return res.status(409).json({ ok: false, message: error.message });
    }
    return next(error);
  }
}

module.exports = {
  login,
  register,
};
