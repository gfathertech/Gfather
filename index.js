import {
    DisconnectReason,
    makeInMemoryStore,
    jidDecode,
    getContentType,
    useMultiFileAuthState,
    downloadContentFromMessage,
    makeWASocket
} from "@whiskeysockets/baileys";
import pino from 'pino';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import axios from 'axios';
import express from 'express';
import proto from "@whiskeysockets/baileys";
import PhoneNumber from 'awesome-phonenumber';

// Load phone number from environment variable (Set this in Koyeb Dashboard)
const ph = process.env.PHONE_NUMBER;
if (!ph) {
    console.error("❌ PHONE_NUMBER environment variable is missing.");
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Keep-alive endpoint
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

// Start Express server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
});

const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });

async function startBotz() {
    const sessionPath = "/tmp/session"; // Temporary writable directory for session storage
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const Gfather = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        auth: state,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: true,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
    });

    store.bind(Gfather.ev);

    // Connection event handling
    Gfather.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log(`✅ Connected as: ${Gfather.user.id}`);

            // Keep-alive mechanism
            setInterval(async () => {
                try {
                    const response = await axios.get(`${process.env.KEEP_ALIVE_URL || 'http://localhost:3000'}/ping`);
                    console.log(`✅ Keep-alive success (${response.status})`);
                } catch (error) {
                    console.error('❌ Keep-alive failed:', error.message);
                }
            }, 80_000); // 80 seconds interval
        }

        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            console.error(`❌ Connection closed: ${reason}`);

            if ([DisconnectReason.badSession, DisconnectReason.connectionClosed, DisconnectReason.connectionLost, DisconnectReason.connectionReplaced, DisconnectReason.restartRequired, DisconnectReason.timedOut].includes(reason)) {
                startBotz();
            }
        }
    });

    // Pairing Code
    if (!Gfather.authState.creds.registered) {
        console.log("📡 Requesting pairing code...");
        try {
            let code = await Gfather.requestPairingCode(ph);
            console.log(`🔑 Pairing Code: ${code?.match(/.{1,4}/g)?.join("-") || code}`);
        } catch (error) {
            console.error("❌ Error requesting pairing code:", error.message);
        }
    }

    Gfather.ev.on('creds.update', saveCreds);

    Gfather.sendText = (jid, text, quoted = '', options) => 
        Gfather.sendMessage(jid, { text, ...options }, { quoted });

    Gfather.downloadMediaMessage = async (message) => {
        let mime = (message.msg || message).mimetype || '';
        let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
        const stream = await downloadContentFromMessage(message, messageType);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        return buffer;
    };

    return Gfather;
}

startBotz();