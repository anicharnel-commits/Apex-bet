const express = require('express');
const { adminAuthMiddleware } = require('../middleware/auth');
const SubscriptionService = require('../services/SubscriptionService');
const AuthService = require('../services/AuthService');
const db = require('../config/db');
const router = express.Router();

router.use(adminAuthMiddleware);

// Dashboard stats
router.get('/dashboard', async (req, res) => {
  try {
    const stats = await new Promise((resolve) => {
      db.get(`
        SELECT 
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM users WHERE status = 'active') as active_users,
          (SELECT COUNT(*) FROM subscriptions WHERE plan = 'TRIAL' AND status = 'active' AND expires_at > datetime('now')) as trial_active,
          (SELECT COUNT(*) FROM subscriptions WHERE plan = 'TRIAL' AND status != 'active') as trial_expired,
          (SELECT COUNT(*) FROM subscriptions WHERE plan = 'VIP' AND status = 'active' AND expires_at > datetime('now')) as vip_active,
          (SELECT COUNT(*) FROM subscriptions WHERE plan = 'VVIP' AND status = 'active' AND expires_at > datetime('now')) as vvip_active,
          (SELECT COUNT(*) FROM subscription_codes) as codes_generated,
          (SELECT COUNT(*) FROM subscription_codes WHERE status = 'used') as codes_used,
          (SELECT COUNT(*) FROM subscription_codes WHERE status = 'unused') as codes_available,
          (SELECT COUNT(*) FROM prediction_access WHERE date = date('now')) as predictions_today,
          (SELECT COUNT(*) FROM prediction_access WHERE date > date('now', '-7 days')) as predictions_week,
          (SELECT COUNT(*) FROM matches WHERE status = 'upcoming') as matches_available
      `, (err, row) => resolve(row));
    });

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all users
router.get('/users', async (req, res) => {
  try {
    const users = await new Promise((resolve) => {
      db.all(`
        SELECT u.*, 
          d.installation_id,
          d.status as device_status,
          s.plan,
          s.daily_limit,
          s.expires_at as subscription_expires,
          (SELECT predictions_used FROM daily_prediction_usage WHERE user_id = u.id AND date = date('now')) as predictions_used
        FROM users u
        LEFT JOIN devices d ON u.id = d.user_id AND d.status = 'active'
        LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active' AND s.expires_at > datetime('now')
        ORDER BY u.created_at DESC
      `, (err, rows) => resolve(rows || []));
    });

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manage user
router.post('/users/:userId/suspend', async (req, res) => {
  const { userId } = req.params;
  try {
    db.run('UPDATE users SET status = "suspended" WHERE id = ?', [userId]);
    res.json({ message: 'User suspended' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/users/:userId/reactivate', async (req, res) => {
  const { userId } = req.params;
  try {
    db.run('UPDATE users SET status = "active" WHERE id = ?', [userId]);
    res.json({ message: 'User reactivated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/users/:userId/reset-device', async (req, res) => {
  const { userId } = req.params;
  try {
    await AuthService.resetDevice(userId);
    res.json({ message: 'Device reset successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate subscription codes
router.post('/codes/generate', async (req, res) => {
  const { plan, durationDays, quantity } = req.body;
  const adminId = req.userId;

  if (!plan || !durationDays || !quantity) {
    return res.status(400).json({ error: 'Plan, duration, and quantity are required' });
  }

  try {
    const dailyLimit = plan === 'VIP' ? 7 : 10;
    const codes = [];

    for (let i = 0; i < quantity; i++) {
      const code = await SubscriptionService.generateCode(plan, durationDays, dailyLimit);
      codes.push(code);
    }

    // Log action
    db.run(
      'INSERT INTO admin_audit_logs (admin_id, admin_email, action, target, metadata) VALUES (?, ?, ?, ?, ?)',
      [adminId, process.env.ADMIN_EMAIL, 'CODE_GENERATED', 'subscription_codes', JSON.stringify({ plan, durationDays, quantity })]
    );

    res.json({
      message: `${quantity} codes generated successfully`,
      codes
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Get codes
router.get('/codes', async (req, res) => {
  const { status, plan } = req.query;
  try {
    let query = 'SELECT * FROM subscription_codes';
    const params = [];
    const conditions = [];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    if (plan) {
      conditions.push('plan = ?');
      params.push(plan);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    const codes = await new Promise((resolve) => {
      db.all(query, params, (err, rows) => resolve(rows || []));
    });

    res.json(codes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Revoke code
router.post('/codes/:codeId/revoke', async (req, res) => {
  const { codeId } = req.params;
  try {
    db.run(
      'UPDATE subscription_codes SET status = "revoked", revoked_at = CURRENT_TIMESTAMP WHERE id = ?',
      [codeId]
    );
    res.json({ message: 'Code revoked successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await new Promise((resolve) => {
      db.all('SELECT * FROM app_settings', (err, rows) => {
        const obj = {};
        rows.forEach(row => obj[row.key] = row.value);
        resolve(obj);
      });
    });
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update settings
router.post('/settings', async (req, res) => {
  const { key, value } = req.body;
  try {
    db.run(
      'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [key, value]
    );
    res.json({ message: 'Setting updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;