import express from 'express';
import { connectDB } from './db.js';
import { startBot } from './bot.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Routes
app.get('/ping', (req, res) => res.sendStatus(200));
app.get('/pairing-code', (req, res) => {
  res.json({ 
    code: pairingCode ? formatPairingCode(pairingCode) : 'No active pairing code' 
  });
});

// Startup sequence
(async () => {
  try {
    await connectDB();
    await startBot();
    
    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🌐 Health check: http://localhost:${PORT}/ping`);
    });

  } catch (error) {
    console.error('🔥 Fatal initialization error:', error.message);
    process.exit(1);
  }
})();

// Helper function
const formatPairingCode = (code) => {
  return code?.match(/.{1,4}/g)?.join('-') || 'Invalid code';
};