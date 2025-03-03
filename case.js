import "./config.js";
import axios from "axios";
import { exec } from "child_process";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  NEXORACLE_API_KEY,
  GEMINI_API_KEY,
  WANZOFC
} from './config.js';

const handler = async (Gfather, m) => {
    try {
        const body = m.text || "";
        const isCmd = body.startsWith(".");
        const command = isCmd ? body.slice(1).split(" ")[0].toLowerCase() : "";
        const args = body.split(" ").slice(1);
        const text = args.join(" ");

        switch (command) {
            case "menu":
                m.reply(`🤖 BOT MENU\n- gemini\n- deepseek\n- gpt4o\n- ping`);
                break;

            case "gemini":
                if (!text) return m.reply("❓ Provide a question.");
                try {
                    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
                    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                    const result = await model.generateContent(text);
                    m.reply(await result.response.text());
                } catch (error) {
                    m.reply("⚠️ Gemini AI error.");
                }
                break;

            case "ping":
                m.reply("🏓 Pong!");
                break;

            case "$":
                exec(args.join(" "), (err, stdout) => {
                    if (err) return m.reply(`⚠️ Error: ${err.message}`);
                    m.reply(stdout);
                });
                break;

            default:
                m.reply("⚠️ Unknown command.");
        }
    } catch (err) {
        console.error(err);
    }
};

export default handler;