import { startBot } from "./bot.js";
import express from "express";
import initDB from "./initdb.js";
import verifyDB from "./db-check.js";

const app = express();
app.get("/ping", (req, res) => res.sendStatus(200));

(async () => {
  try {
    await initDB();
    await verifyDB();

// Add to index.js before starting server
const verifyEnvironment = () => {
    if (!process.env.PHONE_NUMBER.match(/^\d+?@s\.whatsapp\.net$/)) {
        console.error('Invalid PHONE_NUMBER format. Use: 1234567890@s.whatsapp.net');
        process.exit(1);
    }

    if (!process.env.DATABASE_URL.includes('sslmode=require')) {
        console.error('DATABASE_URL must include ?sslmode=require');
        process.exit(1);
    }
};

// Call before initDB()
verifyEnvironment();
    app.listen(process.env.PORT || 3000, () => {
      console.log(`✅ Server running on port ${process.env.PORT || 3000}`);
      startBot();
    });
  } catch (error) {
    console.error('❌ Fatal initialization error:', error.message);
    process.exit(1);
  }
})();