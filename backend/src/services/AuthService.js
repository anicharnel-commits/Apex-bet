const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

class AuthService {
  static hashPassword(password) {
    return bcrypt.hashSync(password, 10);
  }

  static comparePassword(password, hash) {
    return bcrypt.compareSync(password, hash);
  }

  static generateToken(userId) {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
  }

  static verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return null;
    }
  }

  static async register(email, password) {
    const hashed = this.hashPassword(password);
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (email, password_hash) VALUES (?, ?)',
        [email, hashed],
        function(err) {
          if (err) return reject(err);
          resolve(this.lastID);
        }
      );
    });
  }

  static async login(email, password) {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
    if (!user) throw new Error('Utilisateur non trouvé');
    if (!this.comparePassword(password, user.password_hash)) throw new Error('Mot de passe incorrect');
    return user;
  }

  static async bindDevice(userId, installationId, deviceKey, platform) {
    const existing = await new Promise((resolve) => {
      db.get('SELECT * FROM devices WHERE user_id = ? AND status = "active"', [userId], (err, row) => {
        resolve(row);
      });
    });

    if (existing) {
      if (existing.installation_id === installationId) {
        db.run('UPDATE devices SET last_seen = CURRENT_TIMESTAMP WHERE id = ?', [existing.id]);
        return existing;
      } else {
        throw new Error('DEVICE_ALREADY_BOUND');
      }
    }

    const id = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO devices (user_id, installation_id, device_key, platform) VALUES (?, ?, ?, ?)',
        [userId, installationId, deviceKey, platform],
        function(err) {
          if (err) return reject(err);
          resolve(this.lastID);
        }
      );
    });

    return { id, user_id: userId };
  }

  static async getDevice(installationId) {
    return new Promise((resolve) => {
      db.get('SELECT * FROM devices WHERE installation_id = ? AND status = "active"', [installationId], (err, row) => {
        resolve(row);
      });
    });
  }

  static async getUserDevices(userId) {
    return new Promise((resolve) => {
      db.all('SELECT * FROM devices WHERE user_id = ?', [userId], (err, rows) => {
        resolve(rows || []);
      });
    });
  }

  static async resetDevice(userId) {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE devices SET status = "inactive" WHERE user_id = ?',
        [userId],
        function(err) {
          if (err) return reject(err);
          resolve(this.changes);
        }
      );
    });
  }

  static async isAdmin(userId) {
    const user = await new Promise((resolve) => {
      db.get('SELECT email FROM users WHERE id = ?', [userId], (err, row) => resolve(row));
    });
    return user && user.email === process.env.ADMIN_EMAIL;
  }
}

module.exports = AuthService;