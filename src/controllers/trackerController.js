const TrackerEntry = require('../models/TrackerEntry');
const Vessel = require('../models/Vessel');
const { batchCalculateETAs, checkAISStatus, getDestinations } = require('../services/etaCalculatorService');

const trackerController = {
  // GET /tracker
  async index(req, res) {
    try {
      const entries = await TrackerEntry.getWithKpler();
      const entriesWithETAs = await batchCalculateETAs(entries);

      // Add AIS status check
      entriesWithETAs.forEach(e => {
        e.ais_status = checkAISStatus(e.next_destination_eta, e.open_from);
      });

      const controllers = await Vessel.getControllers();
      const destinations = await getDestinations();

      // Get position options for dropdown (same as Excel position list)
      const db = require('../config/database');
      const [posRows] = await db.query('SELECT DISTINCT from_position FROM transit_times ORDER BY from_position');
      const positionOptions = posRows.map(r => r.from_position);

      res.render('tracker/index', {
        entries: entriesWithETAs,
        controllers,
        destinations,
        positionOptions,
        filter: req.query.controller || ''
      });
    } catch (err) {
      console.error('Tracker index error:', err);
      req.flash('error', 'Failed to load tracker');
      res.render('tracker/index', { entries: [], controllers: [], destinations: [], filter: '' });
    }
  },

  // POST /tracker/update/:id (inline edit via AJAX)
  async update(req, res) {
    try {
      const { position, open_from, open_to, notes, next_loading, current_voyage, laden_v_cape } = req.body;
      await TrackerEntry.update(req.params.id, {
        position,
        open_from: open_from || null,
        open_to: open_to || null,
        notes,
        next_loading,
        current_voyage,
        edited_by: req.session.user.initials || req.session.user.username.substring(0, 2).toUpperCase(),
        laden_v_cape
      });
      res.json({ success: true });
    } catch (err) {
      console.error('Tracker update error:', err);
      res.status(500).json({ error: err.message });
    }
  },

  // POST /tracker/add
  async add(req, res) {
    try {
      const { vessel_name, vessel_id } = req.body;
      const db = require('../config/database');
      let vid = vessel_id;

      // If vessel_name provided (new vessel), create it + auto-map to Kpler
      if (vessel_name && !vessel_id) {
        // Check if already exists
        const [existing] = await db.query('SELECT id FROM vessels WHERE name = ?', [vessel_name.trim()]);
        if (existing.length > 0) {
          vid = existing[0].id;
        } else {
          // Try to find in Kpler for auto-mapping
          const [kplerMatch] = await db.query(
            'SELECT kpler_id, cbm, built_year, flag FROM kpler_vessels WHERE LOWER(name) = LOWER(?)',
            [vessel_name.trim()]
          );
          const kplerId = kplerMatch.length > 0 ? kplerMatch[0].kpler_id : null;
          const cbm = kplerMatch.length > 0 ? kplerMatch[0].cbm : null;
          const built = kplerMatch.length > 0 ? kplerMatch[0].built_year : null;

          const [result] = await db.query(
            'INSERT INTO vessels (name, cbm, built, kpler_vessel_id) VALUES (?, ?, ?, ?)',
            [vessel_name.trim(), cbm, built, kplerId]
          );
          vid = result.insertId;
        }
      }

      if (!vid) return res.status(400).json({ error: 'No vessel specified' });

      // Check if tracker entry already exists
      const existingEntry = await TrackerEntry.findByVesselId(vid);
      if (existingEntry) {
        return res.json({ success: true, message: 'Already tracked', id: existingEntry.id });
      }

      const id = await TrackerEntry.create({
        vessel_id: vid,
        edited_by: req.session.user.initials || req.session.user.username.substring(0, 2).toUpperCase()
      });
      res.json({ success: true, id });
    } catch (err) {
      console.error('Tracker add error:', err);
      res.status(500).json({ error: err.message });
    }
  },

  // DELETE /tracker/:id
  async delete(req, res) {
    try {
      await TrackerEntry.delete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // POST /tracker/sync-from-vessels — create tracker entries for all vessels that don't have one
  async syncFromVessels(req, res) {
    try {
      const vessels = await Vessel.getAll();
      let created = 0;
      for (const v of vessels) {
        const existing = await TrackerEntry.findByVesselId(v.id);
        if (!existing) {
          await TrackerEntry.create({ vessel_id: v.id, edited_by: 'SYS' });
          created++;
        }
      }
      req.flash('success', `Synced ${created} new vessels to tracker`);
      res.redirect('/tracker');
    } catch (err) {
      console.error('Sync error:', err);
      req.flash('error', 'Sync failed');
      res.redirect('/tracker');
    }
  }
};

module.exports = trackerController;
