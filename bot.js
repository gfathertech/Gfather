import {
    makeWASocket,
    DisconnectReason,
    makeInMemoryStore,
    useMultiAuthState
} from "@whiskeysockets/baileys";
import pino from "pino";
import { Boom } from "@hapi/boom";
import axios from "axios";
import pkg from "pg";
const { Pool } = pkg;
import handleMessage from "./case.js"; // ✅ Import command handler

// 🔹 Load environment variables
const DATABASE_URL = process.env.DATABASE_URL;
const PHONE_NUMBER = process.env.PHONE_NUMBER;

if (!DATABASE_URL || !PHONE_NUMBER) {
    console.error("❌ Missing DATABASE_URL or PHONE_NUMBER in environment variables.");
    process.exit(1);
}

// 🔹 Connect to PostgreSQL
const pool = new Pool({ connectionString: DATABASE_URL });

// 🔹 Store session in PostgreSQL instead of filesystem
async function saveSession(id, data) {
    await pool.query(
        `INSERT INTO sessions (id, data) VALUES ($1, $2)
        ON CONFLICT (id) DO UPDATE SET data = $2`,
        [id, JSON.stringify(data)]
    );
}
async function loadSession(id) {
    const res = await pool.query(`SELECT data FROM sessions WHERE id = $1`, [id]);
    return res.rows.length ? JSON.parse(res.rows[0].data) : null;
}

// 🔹 Start WhatsApp bot
export async function startBot() {
    console.log("🔄 Loading session from PostgreSQL...");
    const { state, saveCreds } = await useMultiAuthState({
        load: async () => await loadSession("whatsapp"),
        save: async (data) => await saveSession("whatsapp", data),
    });

    const store = makeInMemoryStore({ logger: pino().child({ level: "silent", stream: "store" }) });

    const Gfather = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        auth: state,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
    });

    store.bind(Gfather.ev);

    // 🔹 Connection Handling
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
            }, 80_000);
        }

        if (connection === "close") {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            console.error(`❌ Connection closed: ${reason}`);
            if ([DisconnectReason.badSession, DisconnectReason.connectionClosed, DisconnectReason.connectionLost, DisconnectReason.connectionReplaced, DisconnectReason.restartRequired, DisconnectReason.timedOut].includes(reason)) {
                console.log("🔄 Restarting bot...");
                startBot();
            }
        }
    });

    // 🔹 Request Pairing Code If Not Registered
    if (!Gfather.authState.creds.registered) {
        console.log("📡 Requesting pairing code...");
        try {
            let code = await Gfather.requestPairingCode(PHONE_NUMBER);
            console.log(`🔑 Pairing Code: ${code?.match(/.{1,4}/g)?.join("-") || code}`);
        } catch (error) {
            console.error("❌ Error requesting pairing code:", error.message);
        }
    }

    Gfather.ev.on("creds.update", saveCreds);

    // ✅ Handle incoming messages using `case.js`
    Gfather.ev.on("messages.upsert", async (chatUpdate) => {
        try {
            let m = chatUpdate.messages[0];
            if (!m.message) return;

            m.message = m.message?.ephemeralMessage?.message || m.message;
            if (m.key?.remoteJid === "status@broadcast") return;

            await handleMessage(Gfather, m, chatUpdate, store);
        } catch (err) {
            console.log(err);
        }
    });
}