import { makeWASocket } from "@whiskeysockets/baileys";
import pino from "pino";

async function testConnection() {
    console.log("🔍 Testing WhatsApp Connection...");
    const socket = makeWASocket({
        logger: pino({ level: "silent" }),
    });

    socket.ev.on("connection.update", ({ connection }) => {
        if (connection === "open") {
            console.log("✅ Connection to WhatsApp successful!");
            process.exit(0);
        } else if (connection === "close") {
            console.error("❌ Connection closed.");
            process.exit(1);
        }
    });
}

testConnection();