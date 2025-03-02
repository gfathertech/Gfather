import "./config.js";
import fs from 'fs';
import util from 'util';
import axios from 'axios';
import { exec } from "child_process";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  NEXORACLE_API_KEY,
  GEMINI_API_KEY,
  WANZOFC
} from './config.js';

const api = 'https://api.nexoracle.com/';

const handler = async (Gfather, m) => {
    try {
        const body = (
            (m.mtype === 'conversation' && m.message.conversation) ||
            (m.mtype === 'imageMessage' && m.message.imageMessage.caption) ||
            (m.mtype === 'documentMessage' && m.message.documentMessage.caption) ||
            (m.mtype === 'videoMessage' && m.message.videoMessage.caption) ||
            (m.mtype === 'extendedTextMessage' && m.message.extendedTextMessage.text) ||     
            (m.mtype === 'buttonsResponseMessage' && m.message.buttonsResponseMessage.selectedButtonId) ||
            (m.mtype === 'templateButtonReplyMessage' && m.message.templateButtonReplyMessage.selectedId)
        ) || '';

        const budy = (typeof m.text === 'string') ? m.text : '';
        const prefixRegex = /^[°zZ#$@*+,.?=''():√%!¢£¥€π¤ΠΦ_&><`™©®Δ^βα~¦|/\\©^]/;
        const prefix = prefixRegex.test(body) ? body.match(prefixRegex)[0] : '.';
        const isCmd = body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : '';
        const args = body.trim().split(/ +/).slice(1);
        const text = args.join(" ");
        const sender = m.key.fromMe ? (Gfather.user.id.split(':')[0] + '@s.whatsapp.net' || Gfather.user.id) : (m.key.participant || m.key.remoteJid);
        const botNumber = await Gfather.decodeJid(Gfather.user.id);
        const senderNumber = sender.split('@')[0];
        const isCreator = (m && m.sender && [botNumber, ...global.owner].map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(m.sender)) || false;
        const pushname = m.pushName || `${senderNumber}`;
        const isBot = botNumber.includes(senderNumber);

        switch (command) {
            case "menu":
                m.reply(`
Hello ${pushname}, welcome.

ʙᴏᴛ : ${global.namabot}
ɴᴏ ᴏᴡɴᴇʀ : ${global.owner}
ᴠᴇʀꜱɪᴏɴ : ${global.version}
ᴅᴇᴠᴇʟᴏᴩᴇʀ : ${global.developer}

FEATURES 

> GEMINI
> DEEP SEEK 
> GPT-4o
> PING 
`);
                break;

            case "gemini":
                if (!text) return m.reply("What do you want to ask me?");
                try {
                    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
                    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                    const result = await model.generateContent(text);
                    const response = await result.response.text();
                    m.reply(response);
                } catch (error) {
                    console.error("Gemini Error:", error);
                    m.reply("Failed to process your AI request, please try again later");
                }
                break;

            case "deepseek":
                if (!text) return m.reply("Please provide content");
                try {
                    const { data } = await axios.get(
                        `https://wanzofc.us.kg/api/ai/deepseek-chat?content=${encodeURIComponent(text)}&apikey=${WANZOFC}`
                    );
                    const responseText = data.data?.toString() || "No valid response from AI";
                    m.reply(responseText);
                } catch (error) {
                    console.error('DeepSeek Error:', error);
                    m.reply(`Error: ${error.message}`);
                }
                break;

            case "gpt4o":
                if (!text) return m.reply("Please provide content");
                try {
                    const { data } = await axios.get(
                        `https://wanzofc.us.kg/api/ai/gpt4omini?q=${encodeURIComponent(text)}&apikey=${WANZOFC}`
                    );
                    const responseText = data.data.result?.toString() || "No valid response from AI";
                    m.reply(responseText);
                } catch (error) {
                    console.error('GPT-4o Error:', error);
                    m.reply(`Error: ${error.message}`);
                }
                break;

            case "ping":
                if (!text) return m.reply(`PONG; ${m}, ${Gfather}, ${body}`);
                break;

            case "aii":
                if (!text) return m.reply("Mau nanya apa sama ai");
                try {
                    let { data } = await axios.get(
                        `https://itzpire.site/ai/gpt-web?q=${text}&apikey=${NEXORACLE_API_KEY}`
                    );
                    m.reply(data);
                } catch (error) {
                    m.reply("Error fetching AI response.");
                }
                break;

            default:
                if (budy.startsWith('=>')) {
                    if (!isCreator) return;
                    function Return(sul) {
                        let sat = JSON.stringify(sul, null, 2);
                        let bang = util.format(sat);
                        if (sat == undefined) {
                            bang = util.format(sul);
                        }
                        return m.reply(bang);
                    }
                    try {
                        m.reply(util.format(await eval((async () => { return `${budy.slice(3)}` })()));
                    } catch (e) {
                        m.reply(String(e));
                    }
                }

                if (budy.startsWith('>')) {
                    if (!isCreator) return;
                    let kode = budy.trim().split(/ +/)[0];
                    let teks;
                    try {
                        teks = await eval((async () => {` ${kode === ">>" ? "return" : ""} ${text}`})());
                    } catch (e) {
                        teks = e;
                    } finally {
                        await m.reply(util.format(teks));
                    }
                }

                if (budy.startsWith('$')) {
                    if (!isCreator) return;
                    exec(budy.slice(2), (err, stdout) => {
                        if (err) return m.reply(`${err}`);
                        if (stdout) return m.reply(stdout);
                    });
                }
        }
    } catch (err) {
        console.log(util.format(err));
    }
};

export default handler;

const file = new URL(import.meta.url).pathname;
fs.watchFile(file, () => {
    fs.unwatchFile(file);
    console.log(`Update ${file}`);
    import(file).then(() => console.log("Module reloaded"));
});