import { makeWASocket,
    DisconnectReason,
    makeInMemoryStore,
    jidDecode,
    getContentType,
    useMultiFileAuthState,
    downloadContentFromMessage
  } from "@whiskeysockets/baileys";
  import pino from 'pino';
  import { Boom } from '@hapi/boom';
  import fs from 'fs';
import axios from 'axios';
import express from 'express';
  import readline from "readline";
  import  proto from "@whiskeysockets/baileys";
  import PhoneNumber from 'awesome-phonenumber';

const app = express();
const PORT = process.env.PORT || 3000;

// Koyeb deployment configuration
const koyebUrl = process.env.KOYEB_APP_URL || `http://0.0.0.0:${PORT}`;

// Enhanced health check endpoints
app.get('/ping', (req, res) => {
  res.status(200).json({
    status: 'active',
    platform: 'Koyeb',
    region: process.env.KOYEB_REGION || 'global',
    version: '1.0.0'
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Start server for Koyeb
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on Koyeb at ${koyebUrl}`);
});

const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });

const question = (text) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => { rl.question(text, (answer) => { rl.close(); resolve(answer); }) });
};

async function startBotz() {
  const { state, saveCreds } = await useMultiFileAuthState("session");
  const Gfather = makeWASocket({
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: state,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 10000,
    emitOwnEvents: true,
    fireInitQueries: true,
    generateHighQualityLinkPreview: true,
    syncFullHistory: true,
    markOnlineOnConnect: true,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
  });

  if (!Gfather.authState.creds.registered) {
    const phoneNumber = '2349136429929';
//await question('𝙼𝚊𝚜𝚞𝚔𝚊𝚗 𝙽𝚘𝚖𝚎𝚛 𝚈𝚊𝚗𝚐 
//𝚔𝚝𝚒𝚏 𝙰𝚠𝚊𝚕𝚒 𝙳𝚎𝚗𝚐𝚊𝚗 𝟼𝟸 :\n');
    let code = await Gfather.requestPairingCode(phoneNumber);
    code = code?.match(/.{1,4}/g)?.join("-") || code;
    console.log(`𝙲𝙾𝙳𝙴 𝙿𝙰𝙸𝚁𝙸𝙽𝙶 :,${ code}`);
  }

  store.bind(Gfather.ev);

  Gfather.ev.on('messages.upsert', async chatUpdate => {
    try {
      let m = chatUpdate.messages[0];
      if (!m.message) return;
      m.message = (Object.keys(m.message)[0] === 'ephemeralMessage') ? m.message.ephemeralMessage.message : m.message;
      if (m.key && m.key.remoteJid === 'status@broadcast') return;
      if (!Gfather.public && !m.key.fromMe && chatUpdate.type === 'notify') return;
      if (m.key.id.startsWith('BAE5') && m.key.id.length === 16) return;
      m = smsg(Gfather, m, store);
      import("./case.js").then(module => module.default(Gfather, m, chatUpdate, store));
    } catch (err) {
      console.log(err);
    }
  });

  Gfather.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      let decode = jidDecode(jid) || {};
      return decode.user && decode.server ? decode.user + '@' + decode.server : jid;
    } else return jid;
  };

  Gfather.getName = async (jid, withoutContact = false) => {
    let id = Gfather.decodeJid(jid);
    withoutContact = Gfather.withoutContact || withoutContact;
    let v;
    if (id.endsWith("@g.us")) {
      v = store.contacts[id] || {};
      if (!(v.name || v.subject)) v = await Gfather.groupMetadata(id) || {};
      return v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international');
    } else {
      v = id === '0@s.whatsapp.net' ? { id, name: 'WhatsApp' } : id === Gfather.decodeJid(Gfather.user.id) ? Gfather.user : (store.contacts[id] || {});
      return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international');
    }
  };

  Gfather.public = true;
  Gfather.serializeM = (m) => smsg(Gfather, m, store);

  Gfather.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
      if ([DisconnectReason.badSession, DisconnectReason.connectionClosed, DisconnectReason.connectionLost, DisconnectReason.connectionReplaced, DisconnectReason.restartRequired, DisconnectReason.timedOut].includes(reason)) {
        startBotz();
      } else if (reason !== DisconnectReason.loggedOut) {
        Gfather.end(`Unknown DisconnectReason: ${reason}|${connection}`);
      }
    } else if (connection === 'open') {
      console.log('[Koyeb Connected] ' + JSON.stringify(Gfather.user.id, null, 2));
      console.log(`Bot is running on: ${koyebUrl}`);
    }
  });

  Gfather.ev.on('creds.update', saveCreds);

  Gfather.sendText = (jid, text, quoted = '', options) => Gfather.sendMessage(jid, { text, ...options }, { quoted });

  Gfather.downloadMediaMessage = async (message) => {
    let mime = (message.msg || message).mimetype || '';
    let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
    const stream = await downloadContentFromMessage(message, messageType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
  };

  return Gfather;
}

startBotz();

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

const file = new URL(import.meta.url).pathname;
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.log(`Update ${file}`);
  import(file).then(() => console.log("Module reloaded"));
});