require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const fs = require('fs');

const app = express();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));
app.use(expressLayouts);
app.set('layout', 'layout/main');

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'vlgc-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(flash());

// Global template variables
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.appName = process.env.APP_NAME || 'VLGC Sorter';
  res.locals.currentPath = req.path;
  next();
});

// Uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const PORT = process.env.PORT || 3099;

// Init DB first, then register routes, then start server
(async () => {
  // Step 1: Create database + tables
  const { initAllTables } = require('./src/services/dbInit');
  await initAllTables();

  const { initVoyageTables } = require('./src/services/voyageDbInit');
  await initVoyageTables();

  // Step 2: Register routes (safe now — DB exists)
  app.use('/auth', require('./src/routes/auth'));
  app.use('/dashboard', require('./src/routes/dashboard'));
  app.use('/kpler', require('./src/routes/kpler'));
  app.use('/tracker', require('./src/routes/tracker'));
  app.use('/sorter', require('./src/routes/sorter'));
  app.use('/voyage', require('./src/routes/voyage'));
  app.use('/vessels', require('./src/routes/vessel'));
  app.use('/restricted', require('./src/routes/restricted'));
  app.use('/drydock', require('./src/routes/drydock'));
  app.use('/iran-fs', require('./src/routes/iranFs'));
  app.use('/ag', require('./src/routes/ag'));
  app.use('/coa', require('./src/routes/coa'));
  app.use('/settings', require('./src/routes/settings'));
  app.use('/vessel-intel', require('./src/routes/vesselIntel'));
  app.use('/availability', require('./src/routes/availability'));
  app.use('/kpler-vessels', require('./src/routes/kplerVessels'));
  app.use('/broadcast', require('./src/routes/broadcast'));

  // Root redirect
  app.get('/', async (req, res) => {
    const User = require('./src/models/User');
    const count = await User.count();
    if (count === 0) return res.redirect('/auth/setup');
    if (req.session.user) return res.redirect('/dashboard');
    res.redirect('/auth/login');
  });

  // Step 3: Start server
  app.listen(PORT, () => {
    console.log(`🚢 VLGC Sorter running on http://localhost:${PORT}`);

    // Start Kpler token refresh cron
    const { startTokenCron, startSyncCron } = require('./src/services/kplerCron');
    startTokenCron();
    startSyncCron();

    // Restore WA sessions
    const { restoreSessions } = require('./src/services/waService');
    restoreSessions();
  });
})();
