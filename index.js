import { startBot } from "./bot.js";
import express from "express";
import initDB from "./initdb.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/ping", (req, res) => res.status(200).send("pong"));

(async () => {
    try {
        await initDB();
        app.listen(PORT, () => {
            console.log(`✅ Server running on port ${PORT}`);
            startBot();
        });
    } catch (error) {
        console.error('❌ Fatal initialization error:', error.message);
        process.exit(1);
    }
})();