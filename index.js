import { startBot } from "./bot.js"; // ✅ Import bot logic
import express from "express";

const PORT = process.env.PORT || 3000;

// 🔹 Express server for health checks & keep-alive
const app = express();
app.get("/ping", (req, res) => res.status(200).send("pong"));
app.listen(PORT, "0.0.0.0", () => console.log(`✅ Server running on port ${PORT}`));

// ✅ Start the WhatsApp bot
startBot();