import { useMultiFileAuthState, makeWASocket } from "@whiskeysockets/baileys";
import fs from "fs";
import pino from "pino";

async function startBotz() {
    const sessionPath = "/tmp/session";
    if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const Gfather = makeWASocket({
            logger: pino({ level: "silent" }),
            auth: state
        });

        Gfather.ev.on("creds.update", saveCreds);
        console.log("✅ WhatsApp bot started successfully!");
    } catch (error) {
        console.error("❌ Error initializing WhatsApp bot:", error.message);
    }
}

startBotz();