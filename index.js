import {
    makeWASocket,
    DisconnectReason,
    makeInMemoryStore,
    jidDecode,
    getContentType,
    useMultiAuthState,
    downloadContentFromMessage
} from "@whiskeysockets/baileys";
import pino from "pino";
import { Boom } from "@hapi/boom";
import fs from "fs";
import axios from "axios";
import express from "express";
import { Pool } from "pg";
import proto from "@whiskeysockets/baileys";
import PhoneNumber from "awesome-phonenumber";
import handleMessage from "./case.js"; // ✅ Import case.js

// 🔹 Load environment variables
const DATABASE_URL = process.env.DATABASE_URL;
const PHONE_NUMBER = process.env.PHONE_NUMBER;
const PORT = process.env.PORT || 3000;

if (!DATABASE_URL || !PHONE_NUMBER) {
    console.error("❌ Missing required environment variables: DATABASE_URL or PHONE_NUMBER");
    process.exit(1);
}

// 🔹 Connect to PostgreSQL
const pool = new Pool({ connectionString: DATABASE_URL });

// 🔹 Express server for health checks & keep-alive
const app = express();
app.get("/ping", (req, res) => res.status(200).send("pong"));
app.listen(PORT, "0.0.0.0", () => console.log(`✅ Server running on port ${PORT}`));

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

// 🔹 Start WhatsApp bot with PostgreSQL session storage
async function startBot() {
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
        emitOwnEvents: true,
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
            }, 80_000); // 80 seconds
        }

        if (connection === "close") {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            console.error(`❌ Connection closed: ${reason}`);
            if ([DisconnectReason.badSession, DisconnectReason.connectionClosed, DisconnectReason.connectionLost, DisconnectReason.connectionReplaced, DisconnectReason.restartRequired, DisconnectReason.timedOut].includes(reason)) {
                console.log("🔄 Restarting bot...");
                startBot(); // Restart the bot
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
    Gfather.ev.on('messages.upsert', async chatUpdate => {
        try {
            let m = chatUpdate.messages[0];
            if (!m.message) return;

            m.message = (Object.keys(m.message)[0] === 'ephemeralMessage')
                ? m.message.ephemeralMessage.message
                : m.message;
                
            if (m.key && m.key.remoteJid === 'status@broadcast') return;
            if (!Gfather.public && !m.key.fromMe && chatUpdate.type === 'notify') return;
            if (m.key.id.startsWith('BAE5') && m.key.id.length === 16) return;

            m = smsg(Gfather, m, store);
            await handleMessage(Gfather, m, chatUpdate, store);
        } catch (err) {
            console.log(err);
        }
    });
}

// ✅ Start the bot when the script runs
startBot();

// 🔹 Helper function for message processing
function smsg(Gfather, m, store) {
    if (!m) return m;
    let M = proto.WebMessageInfo;
    if (m.key) {
        m.id = m.key.id;
        m.isBaileys = m.id.startsWith('BAE5') && m.id.length === 16;
        m.chat = m.key.remoteJid;
        m.fromMe = m.key.fromMe;
        m.isGroup = m.chat.endsWith('@g.us');
        m.sender = Gfather.decodeJid(m.fromMe && Gfather.user.id || m.participant || m.key.participant || m.chat || '');
        if (m.isGroup) m.participant = Gfather.decodeJid(m.key.participant) || '';
    }
    if (m.message) {
        m.mtype = getContentType(m.message);
        m.msg = m.message[m.mtype];
        m.text = m.msg.text || m.msg.caption || m.message.conversation || '';
        m.reply = (text, chatId = m.chat, options = {}) => Gfather.sendText(chatId, text, m, options);
    }
    return m;
}