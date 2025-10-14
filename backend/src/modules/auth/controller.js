const { z } = require('zod');
const authService = require('./service');

const loginSchema = z.object({
  email: z.string({ required_error: 'Email is required' }).email('Enter a valid email'),
  password: z.string({ required_error: 'Password is required' }).min(6, 'Password must be at least 6 characters'),
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
    return next(error);
  }
}

module.exports = {
  login,
};
