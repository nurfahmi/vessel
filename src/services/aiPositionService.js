const db = require('../config/database');
const Setting = require('../models/Setting');

/**
 * Use OpenAI to analyze vessel data and pick the best position from the exact options list.
 * Results are cached in port_areas so the same location never needs AI again.
 */
async function analyzePosition(vesselData) {
  const apiKey = await Setting.get('openai_api_key');
  if (!apiKey) throw new Error('OpenAI API key not configured — go to Settings');

  // Get valid position options (same as Excel dropdown)
  const [posRows] = await db.query('SELECT DISTINCT from_position FROM transit_times ORDER BY from_position');
  const positionOptions = posRows.map(r => r.from_position);

  // Only send coordinates + state — zone/country can be stale from old port calls
  const lat = vesselData.lat || vesselData.kpler_lat;
  const lon = vesselData.lon || vesselData.kpler_lon;
  const state = vesselData.state || vesselData.kpler_state;

  const prompt = `A VLGC vessel is at coordinates Lat: ${lat}, Lon: ${lon}. State: ${state || 'unknown'}.
Based on the coordinates, pick the closest matching position from this list.

VALID POSITIONS (pick exactly one):
${positionOptions.join(', ')}

Reply JSON only: {"position": "<exact option>", "reason": "brief"}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 100,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  const result = JSON.parse(content);

  // Validate AI picked a valid option
  if (!positionOptions.includes(result.position)) {
    throw new Error(`AI returned invalid position: "${result.position}"`);
  }

  // Cache the mapping: if we have a real port name, save it to port_areas
  // Skip garbage AIS text that isn't a real location
  const skipPatterns = /^(FOR\s*ORDER|OPL|EOPL|FOR\s*OP|TO\s*ORDER|OWNER|CAPTAIN|MASTER|TBA|TBN|N\/A)/i;
  const cacheKeys = [vesselData.next_dest_name, vesselData.zone_port].filter(Boolean);
  for (const key of cacheKeys) {
    if (skipPatterns.test(key) || key.includes('OWNER') || key.length < 3) continue;
    const [existing] = await db.query('SELECT id FROM port_areas WHERE LOWER(location_name) = ?', [key.toLowerCase()]);
    if (!existing.length) {
      await db.query('INSERT INTO port_areas (location_name, area) VALUES (?, ?)', [key, result.position]);
      console.log(`[AI] Cached: "${key}" → "${result.position}"`);
    }
  }

  return result;
}

module.exports = { analyzePosition };
