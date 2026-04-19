function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  req.flash('error', 'Please log in to continue');
  res.redirect('/auth/login');
}

function isSuperadmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'superadmin') {
    return next();
  }
  req.flash('error', 'Access denied');
  res.redirect('/dashboard');
}

module.exports = { isAuthenticated, isSuperadmin };
