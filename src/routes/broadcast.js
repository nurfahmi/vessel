const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const waService = require('../services/waService');
const { spin } = require('../services/spintextService');
const { isAuthenticated } = require('../middleware/auth');

// Media upload config
const uploadDir = path.join(__dirname, '../../uploads/broadcast');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname)
  }),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// ==================== Pages ====================

router.get('/', isAuthenticated, async (req, res) => {
  try {
    const [senders] = await db.query('SELECT * FROM wa_senders ORDER BY name');
    const [groups] = await db.query('SELECT g.*, s.name as sender_name FROM wa_groups g JOIN wa_senders s ON g.sender_id = s.id ORDER BY s.name, g.group_name');
    const [broadcasts] = await db.query('SELECT * FROM wa_broadcasts ORDER BY created_at DESC LIMIT 20');

    // Attach live status from memory
    senders.forEach(s => {
      const session = waService.getSession(s.session_id);
      s._liveStatus = session.status || s.status;
      s._hasQR = !!session.qr;
    });

    res.render('broadcast/index', { senders, groups, broadcasts });
  } catch (err) {
    console.error('Broadcast page error:', err);
    req.flash('error', 'Failed to load broadcast page');
    res.redirect('/dashboard');
  }
});

// ==================== Sender Management ====================

router.post('/api/add-sender', isAuthenticated, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.json({ error: 'Name required' });
    const sessionId = 'sender_' + Date.now();
    await db.query('INSERT INTO wa_senders (name, session_id) VALUES (?, ?)', [name, sessionId]);
    res.json({ ok: true, sessionId });
  } catch (err) {
    res.json({ error: err.message });
  }
});

router.post('/api/connect/:sessionId', isAuthenticated, async (req, res) => {
  try {
    const { sessionId } = req.params;
    await waService.startSession(sessionId);
    res.json({ ok: true });
  } catch (err) {
    res.json({ error: err.message });
  }
});

router.get('/api/qr/:sessionId', isAuthenticated, async (req, res) => {
  const session = waService.getSession(req.params.sessionId);
  res.json({ qr: session.qr, status: session.status });
});

router.post('/api/disconnect/:sessionId', isAuthenticated, async (req, res) => {
  try {
    await waService.stopSession(req.params.sessionId);
    res.json({ ok: true });
  } catch (err) {
    res.json({ error: err.message });
  }
});

router.delete('/api/sender/:id', isAuthenticated, async (req, res) => {
  try {
    const [sender] = await db.query('SELECT session_id FROM wa_senders WHERE id = ?', [req.params.id]);
    if (sender.length) await waService.stopSession(sender[0].session_id);
    await db.query('DELETE FROM wa_senders WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// ==================== Group Management ====================

router.get('/api/fetch-groups/:sessionId', isAuthenticated, async (req, res) => {
  try {
    const groups = await waService.fetchGroups(req.params.sessionId);
    res.json({ ok: true, count: groups.length, groups });
  } catch (err) {
    res.json({ error: err.message });
  }
});

router.post('/api/toggle-group/:id', isAuthenticated, async (req, res) => {
  try {
    await db.query('UPDATE wa_groups SET active = !active WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// ==================== Broadcast ====================

router.post('/api/send', isAuthenticated, upload.single('media'), async (req, res) => {
  try {
    const { message, delay_min, delay_max } = req.body;
    if (!message && !req.file) return res.json({ error: 'Message or media required' });

    const dMin = parseInt(delay_min) || 30;
    const dMax = parseInt(delay_max) || 60;
    let mediaPath = null, mediaType = null;

    if (req.file) {
      mediaPath = req.file.path;
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) mediaType = 'image';
      else if (['.mp4', '.avi', '.mov', '.mkv'].includes(ext)) mediaType = 'video';
      else mediaType = 'document';
    }

    // Get all active groups with their senders
    const [items] = await db.query(`
      SELECT g.group_jid, g.group_name, g.sender_id, s.session_id 
      FROM wa_groups g 
      JOIN wa_senders s ON g.sender_id = s.id 
      WHERE g.active = 1 AND s.status = 'connected'
      ORDER BY s.id, g.group_name
    `);

    if (!items.length) return res.json({ error: 'No active groups with connected senders' });

    // Create broadcast record
    const [result] = await db.query(
      'INSERT INTO wa_broadcasts (message, media_path, media_type, delay_min, delay_max, total_groups, status) VALUES (?,?,?,?,?,?,?)',
      [message || '', mediaPath, mediaType, dMin, dMax, items.length, 'pending']
    );
    const broadcastId = result.insertId;

    // Create broadcast items
    for (const item of items) {
      await db.query(
        'INSERT INTO wa_broadcast_items (broadcast_id, sender_id, group_jid, group_name) VALUES (?,?,?,?)',
        [broadcastId, item.sender_id, item.group_jid, item.group_name]
      );
    }

    // Start broadcast in background
    executeBroadcast(broadcastId, message, mediaPath, mediaType, dMin, dMax);

    res.json({ ok: true, broadcastId, totalGroups: items.length });
  } catch (err) {
    console.error('Broadcast send error:', err);
    res.json({ error: err.message });
  }
});

// SSE progress stream
router.get('/api/status/:broadcastId', isAuthenticated, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  const broadcastId = req.params.broadcastId;
  const interval = setInterval(async () => {
    try {
      const [bc] = await db.query('SELECT * FROM wa_broadcasts WHERE id = ?', [broadcastId]);
      if (!bc.length) { clearInterval(interval); res.end(); return; }
      const b = bc[0];
      const [items] = await db.query('SELECT * FROM wa_broadcast_items WHERE broadcast_id = ? ORDER BY id', [broadcastId]);
      res.write(`data: ${JSON.stringify({ broadcast: b, items })}\n\n`);
      if (b.status === 'done' || b.status === 'error') {
        clearInterval(interval);
        setTimeout(() => res.end(), 1000);
      }
    } catch (e) {
      clearInterval(interval);
      res.end();
    }
  }, 1000);

  req.on('close', () => clearInterval(interval));
});

// Broadcast history detail
router.get('/api/history/:id', isAuthenticated, async (req, res) => {
  try {
    const [bc] = await db.query('SELECT * FROM wa_broadcasts WHERE id = ?', [req.params.id]);
    const [items] = await db.query('SELECT bi.*, s.name as sender_name FROM wa_broadcast_items bi LEFT JOIN wa_senders s ON bi.sender_id = s.id WHERE bi.broadcast_id = ? ORDER BY bi.id', [req.params.id]);
    res.json({ broadcast: bc[0], items });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// ==================== Broadcast Executor ====================

async function executeBroadcast(broadcastId, message, mediaPath, mediaType, delayMin, delayMax) {
  try {
    await db.query('UPDATE wa_broadcasts SET status = ? WHERE id = ?', ['running', broadcastId]);

    const [items] = await db.query(`
      SELECT bi.id, bi.group_jid, bi.group_name, bi.sender_id, s.session_id
      FROM wa_broadcast_items bi
      JOIN wa_senders s ON bi.sender_id = s.id
      WHERE bi.broadcast_id = ? AND bi.status = 'pending'
    `, [broadcastId]);

    // Group items by sender for parallel execution
    const bySender = {};
    items.forEach(item => {
      if (!bySender[item.session_id]) bySender[item.session_id] = [];
      bySender[item.session_id].push(item);
    });

    // All senders execute in parallel
    const senderPromises = Object.entries(bySender).map(([sessionId, senderItems]) =>
      processSenderQueue(broadcastId, sessionId, senderItems, message, mediaPath, mediaType, delayMin, delayMax)
    );

    await Promise.all(senderPromises);

    // Final status
    const [counts] = await db.query(
      'SELECT SUM(status="sent") as sent, SUM(status="failed") as failed FROM wa_broadcast_items WHERE broadcast_id = ?',
      [broadcastId]
    );
    await db.query('UPDATE wa_broadcasts SET status = ?, sent = ?, failed = ? WHERE id = ?',
      ['done', counts[0].sent || 0, counts[0].failed || 0, broadcastId]
    );

    console.log(`[Broadcast] #${broadcastId} done: ${counts[0].sent} sent, ${counts[0].failed} failed`);
  } catch (err) {
    console.error(`[Broadcast] #${broadcastId} error:`, err);
    await db.query('UPDATE wa_broadcasts SET status = ? WHERE id = ?', ['error', broadcastId]);
  }
}

async function processSenderQueue(broadcastId, sessionId, items, message, mediaPath, mediaType, delayMin, delayMax) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      // Spin text for each group (unique variation)
      const spunText = spin(message);
      await waService.sendToGroup(sessionId, item.group_jid, spunText, mediaPath, mediaType);

      await db.query('UPDATE wa_broadcast_items SET status = ?, sent_at = NOW() WHERE id = ?', ['sent', item.id]);
      // Update running count
      await db.query('UPDATE wa_broadcasts SET sent = sent + 1 WHERE id = ?', [broadcastId]);

      console.log(`[Broadcast] ✓ ${sessionId} → ${item.group_name}`);
    } catch (err) {
      await db.query('UPDATE wa_broadcast_items SET status = ?, error = ? WHERE id = ?', ['failed', err.message, item.id]);
      await db.query('UPDATE wa_broadcasts SET failed = failed + 1 WHERE id = ?', [broadcastId]);
      console.error(`[Broadcast] ✕ ${sessionId} → ${item.group_name}: ${err.message}`);
    }

    // Random delay between groups (skip after last)
    if (i < items.length - 1) {
      const delay = Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin) * 1000;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

module.exports = router;
