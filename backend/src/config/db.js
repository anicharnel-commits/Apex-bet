const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../../apex_fifa.db');
const db = new sqlite3.Database(dbPath);

// Initialize Tables
db.serialize(() => {
  // Users
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  )`);

  // Devices
  db.run(`CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    installation_id TEXT UNIQUE NOT NULL,
    device_key TEXT NOT NULL,
    platform TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME,
    status TEXT DEFAULT 'active',
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Subscriptions
  db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plan TEXT NOT NULL,
    daily_limit INTEGER NOT NULL,
    start_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    status TEXT DEFAULT 'active',
    activation_code_id INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Subscription Codes
  db.run(`CREATE TABLE IF NOT EXISTS subscription_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_hash TEXT UNIQUE NOT NULL,
    code_display TEXT,
    plan TEXT NOT NULL,
    duration_days INTEGER NOT NULL,
    daily_limit INTEGER NOT NULL,
    status TEXT DEFAULT 'unused',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    used_at DATETIME,
    used_by INTEGER,
    revoked_at DATETIME,
    FOREIGN KEY (used_by) REFERENCES users(id)
  )`);

  // Daily Prediction Usage
  db.run(`CREATE TABLE IF NOT EXISTS daily_prediction_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    predictions_used INTEGER DEFAULT 0,
    daily_limit INTEGER NOT NULL,
    UNIQUE(user_id, date),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Prediction Accesses
  db.run(`CREATE TABLE IF NOT EXISTS prediction_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    match_id TEXT NOT NULL,
    date TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    plan TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Matches
  db.run(`CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    competition TEXT,
    format TEXT,
    home_team TEXT,
    away_team TEXT,
    home_id INTEGER,
    away_id INTEGER,
    match_time TEXT,
    status TEXT DEFAULT 'upcoming',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Predictions
  db.run(`CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT NOT NULL,
    model_version TEXT,
    prediction_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    home_prob REAL,
    draw_prob REAL,
    away_prob REAL,
    over15_prob REAL,
    over25_prob REAL,
    over35_prob REAL,
    btts_prob REAL,
    confidence INTEGER,
    data_quality INTEGER,
    recommended_market TEXT,
    signal TEXT,
    edge REAL,
    ev REAL,
    fair_odds_home REAL,
    fair_odds_draw REAL,
    fair_odds_away REAL,
    FOREIGN KEY (match_id) REFERENCES matches(id)
  )`);

  // Admin Audit Logs
  db.run(`CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER,
    admin_email TEXT,
    action TEXT,
    target TEXT,
    metadata TEXT,
    ip TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // App Settings
  db.run(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Insert default settings
  db.run(`INSERT OR IGNORE INTO app_settings (key, value) VALUES 
    ('app_name', '${process.env.APP_NAME}'),
    ('whatsapp_number', '${process.env.WHATSAPP_NUMBER}'),
    ('whatsapp_message', '${process.env.WHATSAPP_MESSAGE}'),
    ('currency', '${process.env.CURRENCY}'),
    ('trial_days', '${process.env.TRIAL_DAYS}'),
    ('trial_daily_limit', '${process.env.TRIAL_DAILY_LIMIT}')
  `);

  console.log('✅ Database initialized successfully');
});

module.exports = db;