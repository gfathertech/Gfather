
import { startBot } from "./bot.js";
import express from "express";
import initDB from "./initdb.js";

const PORT = process.env.PORT || 3000;

const app = express();
app.get("/ping", (req, res) => res.status(200).send("pong"));

// Initialize database first
initDB().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running on port ${PORT}`);
    startBot();
  });
});