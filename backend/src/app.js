require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

// Database
const db = require('./config/db');

// Routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const predictionRoutes = require('./routes/predictionRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');

// Services
const DataCollector = require('./services/DataCollector');

const app = express();

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/subscriptions', subscriptionRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    app: process.env.APP_NAME,
    timezone: process.env.APP_TIMEZONE,
    version: '1.0.0'
  });
});

// Public settings
app.get('/api/settings', (req, res) => {
  res.json({
    appName: process.env.APP_NAME,
    whatsappNumber: process.env.WHATSAPP_NUMBER,
    whatsappMessage: process.env.WHATSAPP_MESSAGE,
    currency: process.env.CURRENCY,
    trialDays: parseInt(process.env.TRIAL_DAYS),
    trialDailyLimit: parseInt(process.env.TRIAL_DAILY_LIMIT),
    prices: {
      vip: {
        '7': parseInt(process.env.VIP_7D_PRICE),
        '14': parseInt(process.env.VIP_14D_PRICE),
        '28': parseInt(process.env.VIP_28D_PRICE)
      },
      vvip: {
        '7': parseInt(process.env.VVIP_7D_PRICE),
        '14': parseInt(process.env.VVIP_14D_PRICE),
        '28': parseInt(process.env.VVIP_28D_PRICE)
      }
    }
  });
});

// Schedule data collection every 6 hours
cron.schedule('0 */6 * * *', () => {
  console.log('📊 Collecting match data...');
  DataCollector.collectMatches();
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 ${process.env.APP_NAME} Server running on port ${PORT}`);
  console.log(`📅 Timezone: ${process.env.APP_TIMEZONE}`);
  console.log(`📱 WhatsApp: ${process.env.WHATSAPP_NUMBER}`);
  console.log(`👤 Admin: ${process.env.ADMIN_EMAIL}`);
});