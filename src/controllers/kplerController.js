const kplerApi = require('../services/kplerApiService');
const Setting = require('../models/Setting');
const db = require('../config/database');

const kplerController = {
  // GET /kpler
  async index(req, res) {
    try {
      const [data] = await db.query(
        "SELECT * FROM kpler_vessels ORDER BY CASE WHEN status = 'Under Construction' THEN 1 ELSE 0 END, name"
      );
      const [trackerCount] = await db.query('SELECT COUNT(*) as count FROM tracker_entries');
      const [vesselCount] = await db.query('SELECT COUNT(*) as count FROM vessels');
      const [mappedCount] = await db.query('SELECT COUNT(*) as count FROM vessels WHERE kpler_vessel_id IS NOT NULL');
      const [enrichedCount] = await db.query('SELECT COUNT(*) as count FROM kpler_vessels WHERE enriched_at IS NOT NULL');
      const lastSync = await Setting.get('kpler_last_sync');
      const hasToken = !!(await Setting.get('kpler_refresh_token'));

      res.render('kpler/index', {
        data,
        trackerCount: trackerCount[0].count,
        vesselCount: vesselCount[0].count,
        kplerCount: data.length,
        mappedCount: mappedCount[0].count,
        enrichedCount: enrichedCount[0].count,
        lastSync,
        hasToken,
      });
    } catch (err) {
      console.error('Kpler index error:', err);
      req.flash('error', 'Failed to load Kpler data');
      res.render('kpler/index', { data: [], batches: [], trackerCount: 0, vesselCount: 0, kplerCount: 0, mappedCount: 0, lastSync: null, hasToken: false, selectedBatch: null });
    }
  },

  // POST /kpler/upload
  async upload(req, res) {
    try {
      if (!req.file) {
        req.flash('error', 'No file uploaded');
        return res.redirect('/kpler');
      }

      const { records, sheetName } = parseKplerExcel(req.file.path);
      const batch = `batch_${Date.now()}`;
      const inserted = await KplerData.bulkInsert(records, batch);

      await db.query(
        'INSERT INTO import_logs (filename, sheet_name, rows_imported, imported_by) VALUES (?, ?, ?, ?)',
        [req.file.originalname, sheetName, inserted, req.session.user.id]
      );

      req.flash('success', `Imported ${inserted} vessels from "${req.file.originalname}"`);
      res.redirect('/kpler');
    } catch (err) {
      console.error('Kpler upload error:', err);
      req.flash('error', 'Upload failed: ' + err.message);
      res.redirect('/kpler');
    }
  },

  // GET /kpler/batch/:batch
  async viewBatch(req, res) {
    try {
      const data = await KplerData.getByBatch(req.params.batch);
      const batches = await KplerData.getBatches();
      res.render('kpler/index', {
        data, batches, trackerCount: 0, vesselCount: 0, kplerCount: data.length,
        mappedCount: 0, lastSync: null, hasToken: false, selectedBatch: req.params.batch
      });
    } catch (err) {
      console.error('Batch view error:', err);
      req.flash('error', 'Failed to load batch');
      res.redirect('/kpler');
    }
  },

  // DELETE /kpler/batch/:batch
  async deleteBatch(req, res) {
    try {
      await KplerData.deleteBatch(req.params.batch);
      req.flash('success', 'Batch deleted');
      res.redirect('/kpler');
    } catch (err) {
      req.flash('error', 'Delete failed');
      res.redirect('/kpler');
    }
  },

  // ─── API SYNC ──────────────────────────────────

  // POST /kpler/api/sync-single — refresh one vessel with individual API call
  async syncSingle(req, res) {
    try {
      const { kpler_vessel_id } = req.body;
      const id = parseInt(kpler_vessel_id);
      const data = await kplerApi.fetchVessel(id);
      const enriched = kplerApi.extractTrackerData(data);

      await db.query(
        `UPDATE kpler_vessels SET 
          state = COALESCE(?, state),
          position = COALESCE(?, position), position_detail = COALESCE(?, position_detail),
          cargo = ?, cargo_volume = ?,
          open_from = COALESCE(?, open_from), open_to = COALESCE(?, open_to),
          controller = COALESCE(?, controller),
          operator = ?, owner = ?, commercial_manager = ?,
          zone_port = COALESCE(?, zone_port),
          next_dest_name = COALESCE(?, next_dest_name),
          next_dest_country = COALESCE(?, next_dest_country),
          lat = COALESCE(?, lat), lon = COALESCE(?, lon),
          enriched_at = NOW()
        WHERE kpler_id = ?`,
        [
          data.state,
          enriched.position, enriched.position_detail,
          enriched.cargo, enriched.cargo_volume || null,
          enriched.open_from ? kplerApi.toMysqlDate(enriched.open_from) : null,
          enriched.open_to ? kplerApi.toMysqlDate(enriched.open_to) : null,
          enriched.controller,
          enriched.operator, data.players?.owners?.[0]?.name || null,
          data.players?.commercialManagers?.[0]?.name || null,
          enriched.last_port,
          data.nextDestination?.installation?.name || data.lastRawAisSignals?.rawDestination || null,
          data.nextDestination?.zone?.country?.name || null,
          enriched.lat, enriched.lon,
          id
        ]
      );

      res.json({
        ok: true,
        position: enriched.position,
        next_dest_name: data.nextDestination?.installation?.name || data.lastRawAisSignals?.rawDestination || null,
        controller: enriched.controller,
        owner: data.players?.owners?.[0]?.name || null,
        state: data.state
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // POST /kpler/api/sync-all — sync all mapped vessels (runs in background)
  async syncAllVessels(req, res) {
    if (global.kplerSyncProgress && global.kplerSyncProgress.running) {
      return res.json({ ok: true, message: 'Sync already running', ...global.kplerSyncProgress });
    }

    // Start in background
    global.kplerSyncProgress = { running: true, phase: 'bulk', synced: 0, enriched: 0, enrichTotal: 0, current: '', done: false };
    
    res.json({ ok: true, message: 'Sync started' });

    // Run async
    try {
      const results = await kplerApi.syncAll((progress) => {
        Object.assign(global.kplerSyncProgress, progress);
      });
      global.kplerSyncProgress = { running: false, done: true, ...results };
    } catch (err) {
      global.kplerSyncProgress = { running: false, done: true, error: err.message };
    }
  },

  // GET /kpler/api/sync-status — poll sync progress
  async syncStatus(req, res) {
    res.json(global.kplerSyncProgress || { running: false, done: false });
  },

  // POST /kpler/api/enrich — enrich all vessels with individual detail calls
  async enrichAll(req, res) {
    try {
      const results = await kplerApi.enrichAll();
      res.json(results);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // POST /kpler/api/test — test API connection
  async testApi(req, res) {
    try {
      const token = await kplerApi.getAccessToken();
      res.json({ ok: true, token_preview: token.substring(0, 20) + '...' });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  },

  // POST /kpler/api/set-token — set access token directly
  async setToken(req, res) {
    try {
      const { access_token, refresh_token } = req.body;
      if (access_token) {
        await kplerApi.setAccessToken(access_token);
      }
      if (refresh_token) {
        await Setting.set('kpler_refresh_token', refresh_token);
        // Immediately generate access token from refresh token
        const { refreshTokenJob } = require('../services/kplerCron');
        await refreshTokenJob();
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // POST /kpler/api/map-vessel — map a vessel name to kpler_vessel_id
  async mapVessel(req, res) {
    try {
      const { vessel_id, kpler_vessel_id } = req.body;
      await db.query('UPDATE vessels SET kpler_vessel_id = ? WHERE id = ?', [parseInt(kpler_vessel_id), parseInt(vessel_id)]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // POST /kpler/api/bulk-map — bulk upload vessel ID mappings (JSON array)
  async bulkMap(req, res) {
    try {
      const mappings = req.body.mappings; // [{name, kpler_vessel_id}] or [{imo, kpler_vessel_id}]
      let mapped = 0;
      for (const m of mappings) {
        let q, params;
        if (m.imo) {
          q = 'UPDATE vessels SET kpler_vessel_id = ? WHERE imo = ?';
          params = [parseInt(m.kpler_vessel_id), m.imo];
        } else if (m.name) {
          q = 'UPDATE vessels SET kpler_vessel_id = ? WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))';
          params = [parseInt(m.kpler_vessel_id), m.name];
        } else continue;
        
        const [r] = await db.query(q, params);
        if (r.affectedRows) mapped++;
      }
      res.json({ ok: true, mapped, total: mappings.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // GET /kpler/api/unmapped — list vessels without kpler_vessel_id
  async unmapped(req, res) {
    try {
      const [rows] = await db.query('SELECT id, name, imo FROM vessels WHERE kpler_vessel_id IS NULL ORDER BY name');
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // POST /kpler/api/fetch-preview/:id — fetch and preview vessel data without saving
  async fetchPreview(req, res) {
    try {
      const data = await kplerApi.fetchVessel(parseInt(req.params.id));
      const extracted = kplerApi.extractTrackerData(data);
      res.json({ raw: data, extracted });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};

module.exports = kplerController;

