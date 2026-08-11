require('dotenv').config();
const db = require('../config/db');
const AuthService = require('../services/AuthService');

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('❌ ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env');
    process.exit(1);
  }

  try {
    const existing = await new Promise((resolve) => {
      db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
        resolve(row);
      });
    });

    if (existing) {
      console.log('⚠️ Admin already exists');
      process.exit(0);
    }

    const hashedPassword = AuthService.hashPassword(password);
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (email, password_hash, status) VALUES (?, ?, "active")',
        [email, hashedPassword],
        function(err) {
          if (err) reject(err);
          resolve(this.lastID);
        }
      );
    });

    console.log('✅ Admin created successfully');
    console.log(`📧 Email: ${email}`);
    console.log(`🔒 Password: ${password}`);
    console.log('🔑 You can now login to the admin panel');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error);
    process.exit(1);
  }
}

seedAdmin();