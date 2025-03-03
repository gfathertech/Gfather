import {
    makeWASocket,
    DisconnectReason,
    makeInMemoryStore,
    initAuthCreds
} from "@whiskeysockets/baileys";
import pino from "pino";
import { Boom } from "@hapi/boom";
import axios from "axios";
import pool from "./db.js";
import handleMessage from "./case.js";

let Gfather = null; // Global socket instance
let keepAliveInterval = null;

async function saveSession(id, data) {
    try {
        await pool.query(
            `INSERT INTO sessions (id, data) VALUES ($1, $2)
            ON CONFLICT (id) DO UPDATE SET data = $2`,
            [id, JSON.stringify(data)]
        );
    } catch (error) {
        console.error("❌ Failed to save session:", error.message);
    }
}

async function loadSession(id) {
    try {
        const res = await pool.query(`SELECT data FROM sessions WHERE id = $1`, [id]);
        return res.rows[0]?.data ? JSON.parse(res.rows[0].data) : null;
    } catch (error) {
        console.error("❌ Failed to load session:", error.message);
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
        Gfather = makeWASocket({
            logger: pino({ level: "silent" }),
            printQRInTerminal: false,
            auth: state,
            connectTimeoutMs: 30000,
            keepAliveIntervalMs: 15000,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
        });

        store.bind(Gfather.ev);

        // Connection State Management
        Gfather.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;
            
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

        // Pairing Code Flow
        if (!state.creds.registered) {
            console.log("📡 Requesting pairing code...");
            try {
                const code = await Gfather.requestPairingCode(process.env.PHONE_NUMBER);
                console.log(`🔑 Pairing Code: ${formatPairingCode(code)}`);
            } catch (error) {
                console.error("❌ Pairing failed:", error.message);
                state.creds = initAuthCreds(); // Reset credentials
                await saveCreds();
                process.env.CONNECTION_RETRIES = "0";
                startBot(); // Immediate retry
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