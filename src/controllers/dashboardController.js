const Vessel = require('../models/Vessel');
const TrackerEntry = require('../models/TrackerEntry');
const Setting = require('../models/Setting');
const db = require('../config/database');

const dashboardController = {
  async index(req, res) {
    try {
      const vesselCount = await Vessel.count();
      const trackerCount = await TrackerEntry.count();
      const [routeRows] = await db.query('SELECT COUNT(*) as c FROM transit_times');
      const routeCount = routeRows[0].c;

      let activeCount = 0;
      let ucCount = 0;
      try {
        const [ac] = await db.query("SELECT COUNT(*) as c FROM kpler_vessels WHERE status = 'Active'");
        const [uc] = await db.query("SELECT COUNT(*) as c FROM kpler_vessels WHERE status = 'Under Construction'");
        activeCount = ac[0].c;
        ucCount = uc[0].c;
      } catch (e) { /* table may not exist yet */ }

      // Kpler API status
      const tokenLastRefresh = await Setting.get('kpler_token_last_refresh');
      const lastSync = await Setting.get('kpler_last_sync');
      const hasRefreshToken = !!(await Setting.get('kpler_refresh_token'));

      // Calculate token health
      let tokenStatus = 'inactive';
      let tokenAge = null;
      if (tokenLastRefresh) {
        const diff = Date.now() - new Date(tokenLastRefresh).getTime();
        tokenAge = Math.floor(diff / 60000); // minutes
        // Cron runs every 4 min. Active if within 10 min, stale if within 60 min.
        tokenStatus = tokenAge < 10 ? 'active' : tokenAge < 60 ? 'stale' : 'expired';
      }

      // Kpler vessels stats
      let kplerStats = { total: 0, ballast: 0, loaded: 0, mapped: 0 };
      try {
        const [total] = await db.query('SELECT COUNT(*) as c FROM kpler_vessels');
        const [ballast] = await db.query("SELECT COUNT(*) as c FROM kpler_vessels WHERE state = 'ballast'");
        const [loaded] = await db.query("SELECT COUNT(*) as c FROM kpler_vessels WHERE state = 'loaded'");
        const [mapped] = await db.query('SELECT COUNT(*) as c FROM vessels WHERE kpler_vessel_id IS NOT NULL');
        kplerStats = { total: total[0].c, ballast: ballast[0].c, loaded: loaded[0].c, mapped: mapped[0].c };
      } catch (e) { /* table may not exist */ }

      res.render('dashboard/index', {
        vesselCount,
        trackerCount,
        routeCount,
        activeCount,
        ucCount,
        tokenStatus,
        tokenAge,
        tokenLastRefresh,
        lastSync,
        hasRefreshToken,
        kplerStats
      });
    } catch (err) {
      console.error('Dashboard error:', err);
      req.flash('error', 'Failed to load dashboard');
      res.render('dashboard/index', {
        vesselCount: 0, trackerCount: 0, routeCount: 0, activeCount: 0, ucCount: 0,
        tokenStatus: 'inactive', tokenAge: null, tokenLastRefresh: null,
        lastSync: null, hasRefreshToken: false, kplerStats: { total: 0, ballast: 0, loaded: 0, mapped: 0 }
      });
    }
  }
};

module.exports = dashboardController;
