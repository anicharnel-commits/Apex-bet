const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const db = require('../config/db');
const router = express.Router();

router.use(authMiddleware);

// Get current user profile
router.get('/profile', async (req, res) => {
  try {
    const user = await new Promise((resolve) => {
      db.get('SELECT id, email, status, created_at, last_login FROM users WHERE id = ?', [req.userId], (err, row) => {
        resolve(row);
      });
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user
router.put('/profile', async (req, res) => {
  const { email } = req.body;
  try {
    db.run('UPDATE users SET email = ? WHERE id = ?', [email, req.userId]);
    res.json({ message: 'Profile updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;