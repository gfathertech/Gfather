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

let Gfather = null;
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
        if (Gfather) {
            Gfather.ev.removeAllListeners();
            if (keepAliveInterval) clearInterval(keepAliveInterval);
        }

        const savedData = await loadSession("whatsapp");
        const state = {
            creds: savedData?.creds || initAuthCreds(),
            keys: savedData?.keys || {}
        };

        const saveCreds = async () => {
            await saveSession("whatsapp", state);
        };

        const store = makeInMemoryStore({ logger: pino().child({ level: "silent" }) });
        Gfather = makeWASocket({
            logger: pino({ level: "silent" }),
            printQRInTerminal: false,
            auth: state,
            connectTimeoutMs: 45000,
            keepAliveIntervalMs: 25000,
            browser: ["Ubuntu", "Chrome", "121.0.0.0"],
            fetchAgent: new (await import('https')).Agent({ 
                keepAlive: true,
                rejectUnauthorized: false
            })
        });

        store.bind(Gfather.ev);

        Gfather.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === "open") {
                console.log(`✅ Connected as ${Gfather.user.id}`);
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
                
                const retries = parseInt(process.env.CONNECTION_RETRIES || "0");
                const delay = Math.min(1000 * 2 ** retries, 30000);
                
                setTimeout(() => {
                    console.log(`🔄 Reconnecting (attempt ${retries + 1})...`);
                    process.env.CONNECTION_RETRIES = (retries + 1).toString();
                    startBot();
                }, delay);
            }
        });

        if (!state.creds.registered) {
            console.log("📡 Requesting pairing code...");
            try {
                const code = await Gfather.requestPairingCode(process.env.PHONE_NUMBER);
                console.log(`🔑 Pairing Code: ${code.replace(/(\d{4})(?=\d)/g, '$1-')}`);
                await new Promise(resolve => setTimeout(resolve, 120000));
            } catch (error) {
                console.error("❌ Pairing failed:", error.message);
                await pool.query('DELETE FROM sessions WHERE id = $1', ['whatsapp']);
                startBot();
            }
        }

        Gfather.ev.on("creds.update", saveCreds);

        Gfather.ev.on("messages.upsert", async ({ messages }) => {
            try {
                const m = messages[0];
                if (!m.message || m.key.remoteJid === "status@broadcast") return;
                await handleMessage(Gfather, m);
            } catch (error) {
                console.error("❌ Message handling error:", error.message);
            }
        });

    } catch (error) {
        console.error("🔥 Critical error:", error.message);
        process.exit(1);
    }
}