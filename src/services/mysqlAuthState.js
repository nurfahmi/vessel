/**
 * Custom MySQL Auth State for Baileys
 * Ported from WA Gateway project (ESM → CJS)
 */
const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

async function useMySQLAuthState(pool, sessionId) {
  const getKey = (key) => `${sessionId}:${key}`;

  const readData = async (id) => {
    try {
      const [rows] = await pool.query('SELECT data FROM wa_sessions WHERE id = ?', [getKey(id)]);
      if (rows.length > 0) {
        return JSON.parse(rows[0].data, BufferJSON.reviver);
      }
      return null;
    } catch (error) {
      console.error(`[WA Auth] Error reading ${id}:`, error.message);
      return null;
    }
  };

  const writeData = async (id, data) => {
    try {
      const serialized = JSON.stringify(data, BufferJSON.replacer);
      await pool.query(
        'INSERT INTO wa_sessions (id, session_id, data_type, data) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE data = ?',
        [getKey(id), sessionId, id, serialized, serialized]
      );
    } catch (error) {
      console.error(`[WA Auth] Error writing ${id}:`, error.message);
    }
  };

  const removeData = async (id) => {
    try {
      await pool.query('DELETE FROM wa_sessions WHERE id = ?', [getKey(id)]);
    } catch (error) {
      console.error(`[WA Auth] Error deleting ${id}:`, error.message);
    }
  };

  const creds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              if (value) data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value === null || value === undefined) {
                tasks.push(removeData(key));
              } else {
                tasks.push(writeData(key, value));
              }
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: async () => {
      await writeData('creds', creds);
    },
    removeCreds: async () => {
      await pool.query('DELETE FROM wa_sessions WHERE session_id = ?', [sessionId]);
    }
  };
}

module.exports = { useMySQLAuthState };
