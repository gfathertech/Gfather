import {
    makeWASocket,
    DisconnectReason,
    makeInMemoryStore,
    initAuthCreds
} from "@whiskeysockets/baileys";
import pino from "pino";
import { Boom } from "@hapi/boom";
import axios from "axios";
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { 
    rejectUnauthorized: false 
  } : false
});

import handleMessage from "./case.js";

// Database setup
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function saveSession(id, data) {
    await pool.query(
        `INSERT INTO sessions (id, data) VALUES ($1, $2)
        ON CONFLICT (id) DO UPDATE SET data = $2`,
        [id, JSON.stringify(data)]
    );
}

async function loadSession(id) {
    const res = await pool.query(`SELECT data FROM sessions WHERE id = $1`, [id]);
    return res.rows[0]?.data ? JSON.parse(res.rows[0].data) : null;
}

export async function startBot() {
    console.log("🔄 Loading session from PostgreSQL...");
    const savedData = await loadSession("whatsapp");
    
    // Initialize auth state
    const state = {
        creds: savedData?.creds || initAuthCreds(),
        keys: savedData?.keys || {}
    };

    const saveCreds = async () => {
        await saveSession("whatsapp", state);
    };

    const store = makeInMemoryStore({ logger: pino().child({ level: "silent" }) });
    const Gfather = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: false, // Keep QR disabled
        auth: state,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
    });

    store.bind(Gfather.ev);

    // Connection Handling
    Gfather.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "open") {
            console.log(`✅ Connected to WhatsApp: ${Gfather.user.id}`);

            // Keep-alive mechanism
            setInterval(async () => {
                try {
                    await axios.get(`${process.env.KEEP_ALIVE_URL || "http://localhost:3000"}/ping`);
                    console.log("✅ Keep-alive successful");
                } catch (error) {
                    console.error("❌ Keep-alive failed:", error.message);
                }
            }, 80000);
        }

        if (connection === "close") {
            const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            console.error(`❌ Connection closed: ${reason}`);
            if ([
                DisconnectReason.badSession, 
                DisconnectReason.connectionClosed, 
                DisconnectReason.connectionLost, 
                DisconnectReason.connectionReplaced, 
                DisconnectReason.restartRequired, 
                DisconnectReason.timedOut
            ].includes(reason)) {
                console.log("🔄 Restarting bot...");
                startBot();
            }
        }
    });

    // Pairing Code Handling
    if (!state.creds.registered) {
        console.log("📡 Requesting pairing code...");
        try {
            const code = await Gfather.requestPairingCode(process.env.PHONE_NUMBER);
            console.log(`🔑 Pairing Code: ${code?.match(/.{1,4}/g)?.join("-") || code}`);
        } catch (error) {
            console.error("❌ Error requesting pairing code:", error.message);
        }
    }

    // Credentials Update Handler
    Gfather.ev.on("creds.update", saveCreds);

    // Message Handling
    Gfather.ev.on("messages.upsert", async (chatUpdate) => {
        try {
            const m = chatUpdate.messages[0];
            if (!m.message) return;

            m.message = m.message?.ephemeralMessage?.message || m.message;
            if (m.key?.remoteJid === "status@broadcast") return;

            await handleMessage(Gfather, m, chatUpdate, store);
        } catch (err) {
            console.log(err);
        }
    });
}