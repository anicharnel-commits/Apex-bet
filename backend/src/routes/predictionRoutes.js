const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const SubscriptionService = require('../services/SubscriptionService');
const PredictionEngine = require('../services/PredictionEngine');
const db = require('../config/db');
const router = express.Router();

router.use(authMiddleware);

// Get available matches
router.get('/matches', async (req, res) => {
  try {
    const matches = await new Promise((resolve) => {
      db.all(
        `SELECT * FROM matches 
         WHERE status = 'upcoming' 
         ORDER BY match_time ASC 
         LIMIT 50`,
        (err, rows) => resolve(rows || [])
      );
    });

    const withPredictions = await Promise.all(matches.map(async (match) => {
      const pred = await new Promise((resolve) => {
        db.get(
          'SELECT * FROM predictions WHERE match_id = ? ORDER BY prediction_timestamp DESC LIMIT 1',
          [match.id],
          (err, row) => resolve(row)
        );
      });
      return { ...match, prediction: pred };
    }));

    res.json(withPredictions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get match prediction (consumes one prediction)
router.get('/match/:matchId', async (req, res) => {
  const userId = req.userId;
  const matchId = req.params.matchId;

  try {
    const { plan, dailyLimit } = await SubscriptionService.getCurrentPlan(userId);
    if (!plan) {
      return res.status(403).json({ 
        error: 'Aucun abonnement actif. Veuillez activer un essai ou souscrire à un abonnement.',
        code: 'NO_SUBSCRIPTION'
      });
    }

    const date = new Date().toISOString().split('T')[0];
    const usage = await new Promise((resolve) => {
      db.get(
        'SELECT predictions_used FROM daily_prediction_usage WHERE user_id = ? AND date = ?',
        [userId, date],
        (err, row) => resolve(row)
      );
    });

    const used = usage ? usage.predictions_used : 0;
    if (used >= dailyLimit) {
      return res.status(429).json({
        error: 'Vous avez utilisé toutes vos prédictions pour aujourd\'hui. Revenez demain.',
        code: 'LIMIT_REACHED',
        used,
        limit: dailyLimit
      });
    }

    const match = await new Promise((resolve) => {
      db.get('SELECT * FROM matches WHERE id = ?', [matchId], (err, row) => resolve(row));
    });

    if (!match) {
      return res.status(404).json({ error: 'Match non trouvé' });
    }

    const prediction = await PredictionEngine.generatePrediction(matchId);

    await new Promise((resolve) => {
      db.run(
        `INSERT INTO predictions 
         (match_id, model_version, home_prob, draw_prob, away_prob, 
          over15_prob, over25_prob, over35_prob, btts_prob,
          confidence, data_quality, recommended_market, signal, edge, ev,
          fair_odds_home, fair_odds_draw, fair_odds_away)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          matchId,
          'v1.0.0',
          prediction.home_prob,
          prediction.draw_prob,
          prediction.away_prob,
          prediction.over15_prob,
          prediction.over25_prob,
          prediction.over35_prob,
          prediction.btts_prob,
          prediction.confidence,
          prediction.data_quality,
          prediction.recommended_market,
          prediction.signal,
          prediction.edge,
          prediction.ev,
          prediction.fair_odds.home,
          prediction.fair_odds.draw,
          prediction.fair_odds.away
        ],
        function(err) {
          if (err) console.error('Error saving prediction:', err);
          resolve(this.lastID);
        }
      );
    });

    db.run(
      'INSERT INTO prediction_access (user_id, match_id, date, plan) VALUES (?, ?, ?, ?)',
      [userId, matchId, date, plan]
    );

    db.run(
      `INSERT INTO daily_prediction_usage (user_id, date, predictions_used, daily_limit)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(user_id, date) DO UPDATE SET predictions_used = predictions_used + 1`,
      [userId, date, dailyLimit]
    );

    const newUsed = used + 1;
    res.json({
      match,
      prediction,
      usage: {
        used: newUsed,
        limit: dailyLimit,
        remaining: dailyLimit - newUsed,
        date
      },
      plan
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Get prediction history
router.get('/history', async (req, res) => {
  try {
    const history = await new Promise((resolve) => {
      db.all(
        `SELECT pa.*, m.home_team, m.away_team, m.format, m.competition,
         p.home_prob, p.draw_prob, p.away_prob, p.confidence, p.signal, p.recommended_market
         FROM prediction_access pa
         JOIN matches m ON pa.match_id = m.id
         LEFT JOIN predictions p ON p.match_id = m.id
         WHERE pa.user_id = ?
         ORDER BY pa.timestamp DESC
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

// Get match formats
router.get('/formats', (req, res) => {
  res.json([
    'EA_FC_1V1',
    'EA_FC_2V2',
    'EA_FC_3V3',
    'EA_FC_4V4',
    'ESPORT_TEAM',
    'ESPORT_SERIES',
    'VIRTUAL_FOOTBALL'
  ]);
});

module.exports = router;