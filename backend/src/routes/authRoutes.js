const express = require('express');
const AuthService = require('../services/AuthService');
const SubscriptionService = require('../services/SubscriptionService');
const { authMiddleware, deviceMiddleware } = require('../middleware/auth');
const db = require('../config/db');
const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  const { email, password, confirmPassword, installationId, deviceKey, platform } = req.body;

  if (!email || !password || !confirmPassword) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Les mots de passe ne correspondent pas' });
  }

  if (!installationId || !deviceKey) {
    return res.status(400).json({ error: 'Identification de l\'appareil requise' });
  }

  try {
    const device = await AuthService.getDevice(installationId);
    if (device) {
      const trialUsed = await new Promise((resolve) => {
        db.get(
          `SELECT s.* FROM subscriptions s 
           JOIN users u ON s.user_id = u.id 
           WHERE s.plan = 'TRIAL' AND s.status = 'active' 
           AND u.id = ? AND s.expires_at > datetime('now')`,
          [device.user_id],
          (err, row) => resolve(row)
        );
      });
      if (trialUsed) {
        return res.status(403).json({ 
          error: 'Cet appareil a déjà utilisé un essai gratuit. Veuillez souscrire à un abonnement.',
          code: 'TRIAL_USED'
        });
      }
    }

    const userId = await AuthService.register(email, password);
    await AuthService.bindDevice(userId, installationId, deviceKey, platform);
    await SubscriptionService.activateTrial(userId);

    const token = AuthService.generateToken(userId);
    const user = await new Promise((resolve) => {
      db.get('SELECT id, email FROM users WHERE id = ?', [userId], (err, row) => resolve(row));
    });

    res.status(201).json({
      message: 'Inscription réussie ! Essai gratuit activé.',
      user,
      token,
      trial: {
        days: parseInt(process.env.TRIAL_DAYS || 7),
        dailyLimit: parseInt(process.env.TRIAL_DAILY_LIMIT || 2)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password, installationId, deviceKey, platform } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }

  try {
    const user = await AuthService.login(email, password);

    let device;
    try {
      device = await AuthService.bindDevice(user.id, installationId, deviceKey, platform);
    } catch (error) {
      if (error.message === 'DEVICE_ALREADY_BOUND') {
        return res.status(403).json({
          error: 'Ce compte est déjà associé à un autre appareil. Pour utiliser le service sur un nouvel appareil, veuillez contacter le support.',
          code: 'DEVICE_ALREADY_BOUND'
        });
      }
      throw error;
    }

    db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

    const subscription = await SubscriptionService.getCurrentPlan(user.id);
    const usage = await SubscriptionService.getDailyUsage(user.id);

    const token = AuthService.generateToken(user.id);

    res.json({
      user: {
        id: user.id,
        email: user.email
      },
      token,
      subscription,
      daily_usage: usage,
      device
    });
  } catch (error) {
    console.error(error);
    res.status(401).json({ error: error.message });
  }
});

// Verify token
router.get('/verify', authMiddleware, async (req, res) => {
  try {
    const user = await new Promise((resolve) => {
      db.get('SELECT id, email FROM users WHERE id = ?', [req.userId], (err, row) => resolve(row));
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const subscription = await SubscriptionService.getCurrentPlan(user.id);
    const usage = await SubscriptionService.getDailyUsage(user.id);

    res.json({
      user,
      subscription,
      daily_usage: usage,
      app: {
        name: process.env.APP_NAME,
        whatsapp: process.env.WHATSAPP_NUMBER
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const user = await new Promise((resolve) => {
    db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => resolve(row));
  });

  if (!user) {
    return res.status(404).json({ error: 'Email not found' });
  }

  res.json({ message: 'Les instructions de réinitialisation ont été envoyées par email' });
});

module.exports = router;