import { makeWASocket, DisconnectReason, initAuthCreds } from '@whiskeysockets/baileys';
import { session } from './db.js';
import pino from 'pino';

let socket = null;
let pairingCode = null;
let reconnectAttempts = 0;

export async function startBot() {
  try {
    // Cleanup previous connection
    if (socket) {
      socket.end();
      socket = null;
    }

    // Load or create session
    const sessionId = 'whatsapp';
    const savedData = await session.load(sessionId);
    const state = {
      creds: savedData?.creds || initAuthCreds(),
      keys: savedData?.keys || {}
    };

    // Create new connection
    socket = makeWASocket({
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: state,
      browser: ['Bot Server', 'Chrome', '121.0.0.0'],
      connectTimeoutMs: 30000,
      keepAliveIntervalMs: 15000,
    });

    // Setup event handlers
    socket.ev.on('creds.update', () => session.save(sessionId, state));
    socket.ev.on('connection.update', update => handleConnectionUpdate(update, sessionId));

    // Handle initial connection
    if (!state.creds.registered) {
      pairingCode = await socket.requestPairingCode(process.env.PHONE_NUMBER);
      console.log(`🔑 Pairing Code: ${formatPairingCode(pairingCode)}`);
      
      // 2-minute pairing window
      setTimeout(() => {
        if (!socket.user?.id) {
          console.log('⏰ Pairing window expired');
          restartBot();
        }
      }, 120000);
    }

    return socket;

  } catch (error) {
    console.error('🔥 Bot startup error:', error.message);
    restartBot();
  }
}

const handleConnectionUpdate = (update, sessionId) => {
  const { connection, lastDisconnect } = update;
  
  if (connection === 'open') {
    console.log('✅ WhatsApp connected');
    reconnectAttempts = 0;
    pairingCode = null;
  }

  if (connection === 'close') {
    const reason = lastDisconnect?.error?.output?.statusCode || DisconnectReason.connectionClosed;
    console.log(`❌ Disconnected (${DisconnectReason[reason] || reason})`);

    if (shouldReconnect(reason)) {
      const delay = Math.min(30000, 2000 * (2 ** reconnectAttempts));
      console.log(`🔄 Reconnecting in ${delay}ms...`);
      setTimeout(startBot, delay);
      reconnectAttempts++;
    } else {
      console.log('🔴 Permanent connection failure');
      session.clear(sessionId);
      process.exit(1);
    }
  }
};

const shouldReconnect = (reason) => {
  return [
    DisconnectReason.connectionClosed,
    DisconnectReason.connectionLost,
    DisconnectReason.restartRequired,
    DisconnectReason.timedOut
  ].includes(reason);
};

const formatPairingCode = (code) => {
  return code.match(/.{1,4}/g).join('-');
};

const restartBot = () => {
  if (reconnectAttempts < 5) {
    console.log('🔄 Restarting bot...');
    startBot();
  } else {
    console.error('🔴 Maximum restart attempts reached');
    process.exit(1);
  }
};