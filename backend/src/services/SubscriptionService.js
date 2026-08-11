const db = require('../config/db');
const crypto = require('crypto');

class SubscriptionService {
  static async getCurrentPlan(userId) {
    // Check trial
    const trial = await new Promise((resolve) => {
      db.get(
        `SELECT * FROM subscriptions 
         WHERE user_id = ? AND plan = 'TRIAL' AND status = 'active' AND expires_at > datetime('now')`,
        [userId],
        (err, row) => resolve(row)
      );
    });
    if (trial) return { plan: 'TRIAL', dailyLimit: trial.daily_limit, expiresAt: trial.expires_at };

    // Check paid subscription
    const sub = await new Promise((resolve) => {
      db.get(
        `SELECT * FROM subscriptions 
         WHERE user_id = ? AND status = 'active' AND expires_at > datetime('now')`,
        [userId],
        (err, row) => resolve(row)
      );
    });
    if (sub) return { plan: sub.plan, dailyLimit: sub.daily_limit, expiresAt: sub.expires_at };

    return { plan: null, dailyLimit: 0, expiresAt: null };
  }

  static async getDailyUsage(userId) {
    const date = new Date().toISOString().split('T')[0];
    const usage = await new Promise((resolve) => {
      db.get(
        'SELECT predictions_used FROM daily_prediction_usage WHERE user_id = ? AND date = ?',
        [userId, date],
        (err, row) => resolve(row)
      );
    });

    const used = usage ? usage.predictions_used : 0;
    const plan = await this.getCurrentPlan(userId);
    const limit = plan.dailyLimit || 0;

    return {
      used,
      limit,
      remaining: Math.max(limit - used, 0),
      date,
      plan: plan.plan
    };
  }

  static async activateTrial(userId) {
    const existing = await new Promise((resolve) => {
      db.get(
        'SELECT * FROM subscriptions WHERE user_id = ? AND plan = "TRIAL"',
        [userId],
        (err, row) => resolve(row)
      );
    });
    if (existing) throw new Error('Essai déjà utilisé');

    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + parseInt(process.env.TRIAL_DAYS || 7));

    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO subscriptions (user_id, plan, daily_limit, start_at, expires_at, status)
         VALUES (?, 'TRIAL', ?, datetime(?), datetime(?), 'active')`,
        [userId, parseInt(process.env.TRIAL_DAILY_LIMIT || 2), start.toISOString(), end.toISOString()],
        function(err) {
          if (err) return reject(err);
          resolve(this.lastID);
        }
      );
    });
  }

  static async generateCode(plan, durationDays, dailyLimit) {
    const random = crypto.randomBytes(16).toString('hex');
    const displayCode = `${plan}-${durationDays}J-${random.substring(0, 8).toUpperCase()}`;
    const codeHash = crypto.createHash('sha256').update(displayCode).digest('hex');

    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO subscription_codes (code_hash, code_display, plan, duration_days, daily_limit, status)
         VALUES (?, ?, ?, ?, ?, 'unused')`,
        [codeHash, displayCode, plan, durationDays, dailyLimit],
        function(err) {
          if (err) return reject(err);
          resolve({
            id: this.lastID,
            code: displayCode,
            plan,
            durationDays,
            dailyLimit
          });
        }
      );
    });
  }

  static async activateCode(code, userId) {
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    const codeData = await new Promise((resolve) => {
      db.get(
        'SELECT * FROM subscription_codes WHERE code_hash = ? AND status = "unused"',
        [codeHash],
        (err, row) => resolve(row)
      );
    });

    if (!codeData) {
      throw new Error('Code invalide ou déjà utilisé');
    }

    return new Promise((resolve, reject) => {
      db.run('BEGIN TRANSACTION');

      db.run(
        'UPDATE subscription_codes SET status = "used", used_at = CURRENT_TIMESTAMP, used_by = ? WHERE id = ?',
        [userId, codeData.id],
        function(err) {
          if (err) {
            db.run('ROLLBACK');
            return reject(err);
          }

          db.get(
            'SELECT * FROM subscriptions WHERE user_id = ? AND status = "active" AND expires_at > datetime("now")',
            [userId],
            (err, existing) => {
              if (err) {
                db.run('ROLLBACK');
                return reject(err);
              }

              let startDate = new Date();
              let expiryDate = new Date(startDate);

              if (existing) {
                expiryDate = new Date(existing.expires_at);
                expiryDate.setDate(expiryDate.getDate() + codeData.duration_days);

                db.run(
                  `UPDATE subscriptions 
                   SET plan = ?, daily_limit = ?, expires_at = datetime(?), status = 'active'
                   WHERE id = ?`,
                  [codeData.plan, codeData.daily_limit, expiryDate.toISOString(), existing.id],
                  function(err) {
                    if (err) {
                      db.run('ROLLBACK');
                      return reject(err);
                    }
                    db.run('COMMIT');
                    resolve({
                      plan: codeData.plan,
                      dailyLimit: codeData.daily_limit,
                      expiresAt: expiryDate.toISOString()
                    });
                  }
                );
              } else {
                const end = new Date(startDate);
                end.setDate(end.getDate() + codeData.duration_days);

                db.run(
                  `INSERT INTO subscriptions (user_id, plan, daily_limit, start_at, expires_at, status, activation_code_id)
                   VALUES (?, ?, ?, datetime(?), datetime(?), 'active', ?)`,
                  [userId, codeData.plan, codeData.daily_limit, startDate.toISOString(), end.toISOString(), codeData.id],
                  function(err) {
                    if (err) {
                      db.run('ROLLBACK');
                      return reject(err);
                    }
                    db.run('COMMIT');
                    resolve({
                      plan: codeData.plan,
                      dailyLimit: codeData.daily_limit,
                      expiresAt: end.toISOString()
                    });
                  }
                );
              }
            }
          );
        }
      );
    });
  }

  static async getActiveSubscriptions() {
    return new Promise((resolve) => {
      db.all(
        `SELECT s.*, u.email 
         FROM subscriptions s
         JOIN users u ON s.user_id = u.id
         WHERE s.status = 'active' AND s.expires_at > datetime('now')
         ORDER BY s.expires_at ASC`,
        (err, rows) => resolve(rows || [])
      );
    });
  }
}

module.exports = SubscriptionService;