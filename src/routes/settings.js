const router = require('express').Router();
const { isAuthenticated, isSuperadmin } = require('../middleware/auth');
const c = require('../controllers/settingsController');
const Setting = require('../models/Setting');

router.get('/', isAuthenticated, isSuperadmin, c.index);
router.post('/', isAuthenticated, isSuperadmin, c.updateSettings);
router.post('/users', isAuthenticated, isSuperadmin, c.createUser);

// OpenAI API key
router.post('/api/openai-key', isAuthenticated, isSuperadmin, async (req, res) => {
  await Setting.set('openai_api_key', req.body.key || '', 'OpenAI API Key');
  res.json({ ok: true });
});

router.post('/api/openai-test', isAuthenticated, isSuperadmin, async (req, res) => {
  const key = await Setting.get('openai_api_key');
  if (!key) return res.json({ ok: false, error: 'No API key set' });
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Reply with just "ok"' }], max_tokens: 5 }),
    });
    if (r.ok) return res.json({ ok: true });
    const err = await r.json();
    res.json({ ok: false, error: err.error?.message || 'API error' });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

module.exports = router;
