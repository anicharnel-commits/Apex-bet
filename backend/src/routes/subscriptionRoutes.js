const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const SubscriptionService = require('../services/SubscriptionService');
const db = require('../config/db');
const router = express.Router();

router.use(authMiddleware);

// Get current subscription
router.get('/current', async (req, res) => {
  try {
    const plan = await SubscriptionService.getCurrentPlan(req.userId);
    const usage = await SubscriptionService.getDailyUsage(req.userId);

    res.json({
      ...plan,
      ...usage,
      plan_type: plan.plan || 'NONE'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Activate code
router.post('/activate', async (req, res) => {
  const { code } = req.body;
  const userId = req.userId;

  if (!code) {
    return res.status(400).json({ error: 'Code requis' });
  }

  try {
    const result = await SubscriptionService.activateCode(code, userId);
    res.json({
      message: 'Abonnement activé avec succès !',
      ...result
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get usage history
router.get('/history', async (req, res) => {
  try {
    const history = await new Promise((resolve) => {
      db.all(
        `SELECT * FROM prediction_access 
         WHERE user_id = ? 
         ORDER BY timestamp DESC 
         LIMIT 50`,
        [req.userId],
        (err, rows) => resolve(rows || [])
      );
    });
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;