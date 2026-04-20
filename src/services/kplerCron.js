const Setting = require('../models/Setting');

const KPLER_AUTH_URL = 'https://auth.kpler.com/oauth/token';

let isRefreshing = false;
let lastSuccessTime = null;

/**
 * Keep the Kpler token alive by refreshing every 4 minutes.
 * Auth0 rotating refresh tokens stay valid as long as they're used
 * before the inactivity timeout (typically 7-30 days).
 * By refreshing every 4 min, the chain never breaks.
 */
async function refreshTokenJob() {
  if (isRefreshing) return;
  isRefreshing = true;

  try {
    const refreshToken = await Setting.get('kpler_refresh_token');
    if (!refreshToken) {
      return; // No token configured, skip silently
    }

    const clientId = await Setting.get('kpler_client_id') || '0LglhXfJvfepANl3HqVT9i1U0OwV0gSP';

    const body = new URLSearchParams({
      client_id: clientId,
      redirect_uri: 'https://terminal.kpler.com/oauth/callback',
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });

    const res = await fetch(KPLER_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://terminal.kpler.com',
      },
      body: body.toString()
    });

    if (res.ok) {
      const data = await res.json();
      
      // Save the new access token
      if (data.access_token) {
        await Setting.set('kpler_access_token', data.access_token);
      }
      
      // Save the new rotated refresh token (critical!)
      if (data.refresh_token) {
        await Setting.set('kpler_refresh_token', data.refresh_token);
      }

      lastSuccessTime = Date.now();
      await Setting.set('kpler_token_last_refresh', new Date().toISOString());
      console.log(`[Kpler Cron] ✓ Token refreshed at ${new Date().toLocaleTimeString()}`);
    } else {
      const err = await res.text();
      console.error(`[Kpler Cron] ✕ Token refresh failed: ${err}`);
    }
  } catch (err) {
    console.error(`[Kpler Cron] ✕ Error: ${err.message}`);
  } finally {
    // ALWAYS unlock — prevents deadlock
    isRefreshing = false;
  }
}

/**
 * Start the token refresh cron (every 4 minutes)
 */
function startTokenCron() {
  // Refresh immediately on startup
  refreshTokenJob();
  
  // Then every 4 minutes
  const FOUR_MINUTES = 4 * 60 * 1000;
  setInterval(refreshTokenJob, FOUR_MINUTES);
  
  console.log('[Kpler Cron] Token refresh started (every 4 min)');
}

/**
 * Start the vessel sync cron (every 6 hours)
 */
function startSyncCron() {
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  
  setInterval(async () => {
    try {
      const kplerApi = require('./kplerApiService');
      console.log('[Kpler Cron] Starting auto-sync...');
      const results = await kplerApi.syncAll();
      console.log(`[Kpler Cron] ✓ Sync done: ${results.synced} synced, ${results.failed} failed`);
    } catch (err) {
      console.error(`[Kpler Cron] ✕ Auto-sync failed: ${err.message}`);
    }
  }, SIX_HOURS);
  
  console.log('[Kpler Cron] Auto-sync started (every 6 hours)');
}

module.exports = { startTokenCron, startSyncCron, refreshTokenJob };
