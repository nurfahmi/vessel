const User = require('../models/User');

const authController = {
  // GET /auth/login
  loginPage(req, res) {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('auth/login', { layout: false });
  },

  // POST /auth/login
  async login(req, res) {
    try {
      const { username, password } = req.body;
      const user = await User.findByUsername(username);
      if (!user) {
        req.flash('error', 'Invalid credentials');
        return res.redirect('/auth/login');
      }
      const valid = await User.verifyPassword(password, user.password);
      if (!valid) {
        req.flash('error', 'Invalid credentials');
        return res.redirect('/auth/login');
      }
      req.session.user = { id: user.id, username: user.username, display_name: user.display_name, initials: user.initials, role: user.role };
      res.redirect('/dashboard');
    } catch (err) {
      console.error('Login error:', err);
      req.flash('error', 'Login failed');
      res.redirect('/auth/login');
    }
  },

  // GET /auth/setup
  async setupPage(req, res) {
    const count = await User.count();
    if (count > 0) return res.redirect('/auth/login');
    res.render('auth/setup', { layout: false });
  },

  // POST /auth/setup
  async setup(req, res) {
    try {
      const count = await User.count();
      if (count > 0) return res.redirect('/auth/login');
      const { username, password, display_name, initials } = req.body;
      await User.create({ username, password, display_name, initials, role: 'superadmin' });
      req.flash('success', 'Superadmin account created. Please log in.');
      res.redirect('/auth/login');
    } catch (err) {
      console.error('Setup error:', err);
      req.flash('error', 'Setup failed: ' + err.message);
      res.redirect('/auth/setup');
    }
  },

  // GET /auth/logout
  logout(req, res) {
    req.session.destroy();
    res.redirect('/auth/login');
  }
};

module.exports = authController;
