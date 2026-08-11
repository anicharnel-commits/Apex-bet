const AuthService = require('../services/AuthService');
const db = require('../config/db');

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  const decoded = AuthService.verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  req.userId = decoded.id;
  next();
};

const adminMiddleware = async (req, res, next) => {
  const isAdmin = await AuthService.isAdmin(req.userId);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Accès administrateur requis' });
  }
  next();
};

const deviceMiddleware = async (req, res, next) => {
  const installationId = req.headers['x-installation-id'];
  const deviceKey = req.headers['x-device-key'];
  const platform = req.headers['x-platform'] || 'web';

  if (!installationId || !deviceKey) {
    return res.status(400).json({ error: 'Device identification required' });
  }

  const device = await AuthService.getDevice(installationId);
  if (!device) {
    req.device = { installationId, deviceKey, platform, isNew: true };
    return next();
  }

  if (device.user_id !== req.userId) {
    return res.status(403).json({ 
      error: 'Ce compte est déjà associé à un autre appareil. Pour utiliser le service sur un nouvel appareil, veuillez contacter le support.',
      code: 'DEVICE_MISMATCH'
    });
  }

  req.device = device;
  next();
};

const adminAuthMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  const decoded = AuthService.verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  req.userId = decoded.id;
  
  const isAdmin = await AuthService.isAdmin(req.userId);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Accès administrateur requis' });
  }
  
  next();
};

module.exports = { authMiddleware, adminMiddleware, deviceMiddleware, adminAuthMiddleware };