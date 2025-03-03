import { startBot } from "./bot.js";
import express from "express";
import initDB from "./initdb.js";

const app = express();
app.get("/ping", (req, res) => res.sendStatus(200));

(async () => {
  try {
    await initDB();
    app.listen(process.env.PORT || 3000, () => {
      console.log(`✅ Server running on port ${process.env.PORT || 3000}`);
      startBot();
    });
  } catch (error) {
    console.error('❌ Fatal initialization error:', error.message);
    process.exit(1);
  }
})();