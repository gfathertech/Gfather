
import pkg from '@whiskeysockets/baileys';
const { 
    makeWASocket, 
    DisconnectReason, 
    makeInMemoryStore, 
    initAuthCreds,
    useSingleFileAuthState 
} = pkg;
import pino from "pino";
import { Boom } from "@hapi/boom";
import axios from "axios";
import pool from "./db.js";
import handleMessage from "./case.js";
import https from 'https';
const { KeyedDB } = '@whiskeysockets/baileys';
const messageRetryCache = new KeyedDB(
    {
        make: (m) => m.key.id,
        compare: (a, b) => a.localeCompare(b)
    },
    "asc"
);
let Gfather = null; // Global socket instance
let keepAliveInterval = null;

async function saveSession(id, data) {
    try {
        // Validate session data
        const validatedData = {
            creds: data.creds || {},
            keys: data.keys || {}
        };
        
        await pool.query(
            `INSERT INTO sessions (id, data) VALUES ($1, $2)
            ON CONFLICT (id) DO UPDATE SET data = $2`,
            [id, JSON.stringify(validatedData)]
        );
    } catch (error) {
        console.error("❌ Failed to save session:", error.message);
    }
}


// Update loadSession() in bot.js
async function loadSession(id) {
    try {
        const res = await pool.query(`SELECT data FROM sessions WHERE id = $1`, [id]);
        const rawData = res.rows[0]?.data;
        
        // Handle invalid JSON format
        if (typeof rawData === 'string') {
            try {
                return JSON.parse(rawData);
            } catch {
                await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
                return null;
            }
        }
        return rawData || null;
    } catch (error) {
        console.error("❌ Session load error:", error.message);
        return null;
    }
}

export async function startBot() {
    console.log("🔄 Initializing WhatsApp connection...");
    
    try {
        // Cleanup previous connection
        if (Gfather) {
            Gfather.ev.removeAllListeners();
            if (keepAliveInterval) clearInterval(keepAliveInterval);
        }

        // Load session from PostgreSQL
        const savedData = await loadSession("whatsapp");
        const state = {
            creds: savedData?.creds || initAuthCreds(),
            keys: savedData?.keys || {}
        };

        const saveCreds = async () => {
            await saveSession("whatsapp", state);
        };

       // Configure WhatsApp socket
const store = makeInMemoryStore({ logger: pino().child({ level: "silent" }) });

const Gfather = makeWASocket({
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: state,
    connectTimeoutMs: 45000,
    keepAliveIntervalMs: 25000,
    browser: ["Ubuntu", "Chrome", "121.0.0.0"],
    markOnlineOnConnect: false,
    mobile: false,
    syncFullHistory: false,
    transactionOpts: {
        maxCommitRetries: 3,
        delayBetweenTriesMs: 3000
    },
    getMessage: async () => ({}),
    fetchAgent: new https.Agent({ 
        keepAlive: true,
        rejectUnauthorized: false
    }),
    retryRequestDelayMs: 2000,
    maxMsgRetryCount: 5,
    defaultQueryTimeoutMs: 60000,
    version: [2, 2413, 1],
    phoneResponseTime: 30000,
    linkPreviewImageThumbnailWidth: 192,
    msgRetryCounterCache: messageRetryCache,
    qrTimeout: 120000,
    keepAliveReqTimeout: 15000,
    emitOwnEvents: false,
    deviceInfo: {
        osVersion: "11.0.0",
        manufacturer: "Google",
        model: "Bot Server",
        osBuildNumber: "RD2A.210305.006"
    }
});

        store.bind(Gfather.ev);

        // Connection State Management
        Gfather.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;
// Add to bot.js connection.update handler
   console.log('Connection update:', JSON.stringify(update));
            
            if (connection === "open") {
                console.log(`✅ Connected as ${Gfather.user.id}`);
                // Start keep-alive
                keepAliveInterval = setInterval(async () => {
                    try {
                        await axios.get(`${process.env.KEEP_ALIVE_URL}/ping`);
                        console.log("🫀 Keep-alive successful");
                    } catch (error) {
                        console.error("💔 Keep-alive failed:", error.message);
                    }
                }, 80000);
            }
// Add after connection.open event
Gfather.ev.on('connection.update', async (update) => {
    if (update.connection === 'open') {
       
        try {
            await Gfather.fetchBlocklist();
            console.log("✅ Verified WhatsApp connection");
        } catch (error) {
            console.error("❌ Connection verification failed:", error.message);
            Gfather.end();
        }
    }
});

            if (connection === "close") {
                const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
                console.error(`❌ Connection closed (${reason}): ${DisconnectReason[reason] || "Unknown"}`);
                
                // Exponential backoff reconnect
                const retries = parseInt(process.env.CONNECTION_RETRIES || "0");
                const delay = Math.min(1000 * 2 ** retries, 30000);
                
                setTimeout(() => {
                    console.log(`🔄 Reconnecting (attempt ${retries + 1})...`);
                    process.env.CONNECTION_RETRIES = (retries + 1).toString();
                    startBot();
                }, delay);
            }
        });

      // Update pairing code section in bot.js
if (!state.creds.registered) {
    console.log("📡 Requesting pairing code...");
    try {
        const code = await Gfather.requestPairingCode(process.env.PHONE_NUMBER);
        console.log(`🔑 Enter this code in WhatsApp within 2 minutes: ${formatPairingCode(code)}`);
        
        // Wait for pairing completion
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                Gfather.ev.off('creds.update', checkRegistration);
                reject(new Error('Pairing timeout'));
            }, 120000);

            const checkRegistration = () => {
                if (state.creds.registered) {
                    clearTimeout(timeout);
                    resolve();
                }
            };

            Gfather.ev.on('creds.update', checkRegistration);
        });
    } catch (error) {
        console.error("❌ Pairing failed:", error.message);
        await pool.query('DELETE FROM sessions WHERE id = $1', ['whatsapp']);
        startBot();
    }
}

        // Credentials Update Handler
        Gfather.ev.on("creds.update", saveCreds);

        // Message Handling
        Gfather.ev.on("messages.upsert", async ({ messages }) => {
            try {
                const m = messages[0];
                if (!m.message || m.key.remoteJid === "status@broadcast") return;

                // Process message through handler
                await handleMessage(Gfather, m);
            } catch (error) {
                console.error("❌ Message handling error:", error.message);
            }
        });

    } catch (error) {
        console.error("🔥 Critical initialization error:", error.message);
        process.exit(1);
    }
}

function formatPairingCode(code) {
    return code.match(/.{1,4}/g)?.join("-") || code;
}