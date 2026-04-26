/**
 * WhatsApp Service — Baileys multi-session manager
 * Ported from WA Gateway project pattern
 */
const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const { useMySQLAuthState } = require('./mysqlAuthState');

// Active sockets map: sessionId -> { sock, qr, status }
const sessions = new Map();
const retryCount = new Map();
const MAX_RETRIES = 5;

// Browser fingerprints (same as WA Gateway)
const BROWSERS = [
  ["Ubuntu", "Chrome", "131.0.6778.204"],
  ["Windows", "Edge", "131.0.2903.86"],
  ["macOS", "Safari", "18.2"],
  ["Windows", "Chrome", "131.0.6778.205"],
  ["Ubuntu", "Firefox", "133.0.3"],
  ["macOS", "Chrome", "131.0.6778.205"],
  ["Windows", "Firefox", "133.0.3"],
  ["Linux", "Chrome", "131.0.6778.204"],
];

function getBrowser(sessionId) {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) hash = sessionId.charCodeAt(i) + ((hash << 5) - hash);
  return BROWSERS[Math.abs(hash) % BROWSERS.length];
}

/**
 * Start a Baileys session for a sender
 */
async function startSession(sessionId) {
  // If already connected, return
  if (sessions.has(sessionId) && sessions.get(sessionId).status === 'connected') {
    return sessions.get(sessionId);
  }

  // Close old socket if exists
  if (sessions.has(sessionId)) {
    const old = sessions.get(sessionId);
    if (old.sock) {
      try { old.sock.end(undefined); } catch(e) {}
    }
    sessions.delete(sessionId);
  }

  const session = { sock: null, qr: null, status: 'connecting' };
  sessions.set(sessionId, session);

  try {
    const { state, saveCreds, removeCreds } = await useMySQLAuthState(db, sessionId);

    // Fetch latest WA version
    let version;
    try {
      const versionInfo = await fetchLatestBaileysVersion();
      version = versionInfo.version;
      console.log(`[WA] ${sessionId} using WA version: ${version}`);
    } catch (e) {
      version = [2, 3000, 1034195523]; // known working fallback
      console.log(`[WA] ${sessionId} version fetch failed, using fallback`);
    }

    const sock = makeWASocket({
      logger: pino({ level: 'warn' }),
      printQRInTerminal: false,
      version,
      auth: state,
      defaultQueryTimeoutMs: 120_000,
      keepAliveIntervalMs: 30_000,
      browser: getBrowser(sessionId),
      emitOwnEvents: true,
      markOnlineOnConnect: false,
      shouldSyncHistoryMessage: () => false,
      getMessage: async () => undefined,
    });

    session.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        session.qr = await QRCode.toDataURL(qr);
        session.status = 'qr_pending';
        await db.query('UPDATE wa_senders SET status = ? WHERE session_id = ?', ['qr_pending', sessionId]);
        console.log(`[WA] QR ready for ${sessionId}`);
      }

      if (connection === 'open') {
        session.qr = null;
        session.status = 'connected';
        retryCount.set(sessionId, 0);
        const phone = sock.user?.id?.split(':')[0] || sock.user?.id?.split('@')[0] || '';
        await db.query('UPDATE wa_senders SET status = ?, phone = ? WHERE session_id = ?', ['connected', phone, sessionId]);
        console.log(`[WA] ✓ ${sessionId} connected (${phone})`);
      }

      if (connection === 'close') {
        session.status = 'disconnected';
        session.sock = null;
        await db.query('UPDATE wa_senders SET status = ? WHERE session_id = ?', ['disconnected', sessionId]);

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        const retries = (retryCount.get(sessionId) || 0) + 1;

        if (shouldReconnect && retries <= MAX_RETRIES) {
          retryCount.set(sessionId, retries);
          const delay = Math.min(3000 * Math.pow(2, retries - 1), 5 * 60 * 1000);
          console.log(`[WA] ${sessionId} disconnected (code ${statusCode}), retry ${retries}/${MAX_RETRIES} in ${delay/1000}s`);
          setTimeout(() => startSession(sessionId), delay);
        } else if (statusCode === DisconnectReason.loggedOut) {
          console.log(`[WA] ${sessionId} logged out, clearing session`);
          sessions.delete(sessionId);
          retryCount.delete(sessionId);
          await removeCreds();
        } else {
          console.log(`[WA] ${sessionId} max retries reached, stopping`);
          sessions.delete(sessionId);
          retryCount.delete(sessionId);
        }
      }
    });

    return session;
  } catch (err) {
    console.error(`[WA] Error starting ${sessionId}:`, err.message);
    session.status = 'error';
    return session;
  }
}

/**
 * Stop a session gracefully
 */
async function stopSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session?.sock) {
    try { session.sock.end(undefined); } catch(e) {}
    session.sock = null;
    session.status = 'disconnected';
  }
  sessions.delete(sessionId);
  retryCount.delete(sessionId);
  await db.query('UPDATE wa_senders SET status = ? WHERE session_id = ?', ['disconnected', sessionId]);
}

/**
 * Get session info (status, QR)
 */
function getSession(sessionId) {
  return sessions.get(sessionId) || { sock: null, qr: null, status: 'disconnected' };
}

/**
 * Fetch all groups for a sender and save to DB
 */
async function fetchGroups(sessionId) {
  const session = sessions.get(sessionId);
  if (!session?.sock) throw new Error('Not connected');

  const groups = await session.sock.groupFetchAllParticipating();
  const [sender] = await db.query('SELECT id FROM wa_senders WHERE session_id = ?', [sessionId]);
  if (!sender.length) throw new Error('Sender not found');

  const senderId = sender[0].id;
  const groupList = [];

  for (const [jid, meta] of Object.entries(groups)) {
    groupList.push({ jid, name: meta.subject || jid });
    await db.query(
      'INSERT INTO wa_groups (sender_id, group_jid, group_name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE group_name = VALUES(group_name)',
      [senderId, jid, meta.subject || jid]
    );
  }

  return groupList;
}

/**
 * Send a message (text / image / document / video) to a group
 */
async function sendToGroup(sessionId, groupJid, text, mediaPath, mediaType) {
  const session = sessions.get(sessionId);
  if (!session?.sock) throw new Error('Not connected');

  if (mediaPath && mediaType && fs.existsSync(mediaPath)) {
    const buffer = fs.readFileSync(mediaPath);
    const filename = path.basename(mediaPath);

    if (mediaType === 'image') {
      await session.sock.sendMessage(groupJid, { image: buffer, caption: text || '' });
    } else if (mediaType === 'video') {
      await session.sock.sendMessage(groupJid, { video: buffer, caption: text || '' });
    } else if (mediaType === 'document') {
      await session.sock.sendMessage(groupJid, { document: buffer, fileName: filename, caption: text || '' });
    }
  } else if (text) {
    await session.sock.sendMessage(groupJid, { text });
  }
}

/**
 * Restore all connected sessions on startup
 */
async function restoreSessions() {
  try {
    const [senders] = await db.query('SELECT session_id FROM wa_senders WHERE status = "connected"');
    for (const s of senders) {
      console.log(`[WA] Restoring session: ${s.session_id}`);
      startSession(s.session_id);
    }
  } catch (e) {
    // Tables may not exist yet on first run
  }
}

module.exports = { startSession, stopSession, getSession, fetchGroups, sendToGroup, restoreSessions };
