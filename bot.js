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
import handleMessage from "./case.js";

// Database setup remains the same
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
        printQRInTerminal: true, // Keep this true for QR scanning
        auth: state,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
    });

    store.bind(Gfather.ev);

    // Add connection update handler
    Gfather.ev.on("connection.update", (update) => {
        // ... rest of your connection handler code
    });

    // Add credentials update handler
    Gfather.ev.on("creds.update", saveCreds);

    // Add message handler
    Gfather.ev.on("messages.upsert", handleMessage);
    
    // Request pairing code if needed
    if (!state.creds.registered) {
        const code = await Gfather.requestPairingCode(process.env.PHONE_NUMBER);
        console.log(`Pairing code: ${code}`);
    }
}