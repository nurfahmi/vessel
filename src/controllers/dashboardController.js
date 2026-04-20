const Setting = require('../models/Setting');
const db = require('../config/database');

const dashboardController = {
  async index(req, res) {
    try {
      // Kpler fleet stats (primary source)
      let fleetStats = { total: 0, active: 0, uc: 0, ballast: 0, loaded: 0, no_ais: 0, enriched: 0 };
      try {
        const [s] = await db.query(`
          SELECT 
            COUNT(*) as total,
            SUM(status='Active') as active,
            SUM(status='Under Construction') as uc,
            SUM(state='ballast') as ballast,
            SUM(state='loaded') as loaded,
            SUM(status='Active' AND lat IS NULL AND speed IS NULL) as no_ais,
            SUM(is_floating_storage=1) as floating_storage
          FROM kpler_fleet
        `);
        fleetStats = s[0];
      } catch (e) { /* table may not exist yet */ }

      // Enriched count from kpler_vessels
      let enrichedCount = 0;
      try {
        const [ec] = await db.query('SELECT COUNT(*) as c FROM kpler_vessels WHERE enriched_at IS NOT NULL');
        enrichedCount = ec[0].c;
      } catch (e) {}

      // Voyage data stats
      let voyageStats = { destinations: 0, transitRoutes: 0, portAreas: 0 };
      try {
        const [d] = await db.query('SELECT COUNT(*) as c FROM destinations');
        const [t] = await db.query('SELECT COUNT(*) as c FROM transit_times');
        const [p] = await db.query('SELECT COUNT(*) as c FROM port_areas');
        voyageStats = { destinations: d[0].c, transitRoutes: t[0].c, portAreas: p[0].c };
      } catch (e) {}

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
        tokenStatus = tokenAge < 10 ? 'active' : tokenAge < 60 ? 'stale' : 'expired';
      }

      res.render('dashboard/index', {
        fleetStats,
        enrichedCount,
        voyageStats,
        tokenStatus,
        tokenAge,
        tokenLastRefresh,
        lastSync,
        hasRefreshToken
      });
    } catch (err) {
      console.error('Dashboard error:', err);
      req.flash('error', 'Failed to load dashboard');
      res.render('dashboard/index', {
        fleetStats: { total: 0, active: 0, uc: 0, ballast: 0, loaded: 0, no_ais: 0, floating_storage: 0 },
        enrichedCount: 0,
        voyageStats: { destinations: 0, transitRoutes: 0, portAreas: 0 },
        tokenStatus: 'inactive', tokenAge: null, tokenLastRefresh: null,
        lastSync: null, hasRefreshToken: false
      });
    }
  }
};

module.exports = dashboardController;
