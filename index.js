const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const fs = require('fs');

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Europe/Bucharest');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const DATA_FILE = './bosses.json';
const DASHBOARD_FILE = './dashboard.json';

let bosses = [];
let dashboardMessage = null;
let channel = null;

// notified stochează timestamp-ul ISO al spawn-ului pentru care s-a trimis notificarea
// ex: { "Wubba": "2026-03-25T14:10:00.000Z" }
const notified = {};

// ---------------- LOAD / SAVE ----------------
if (fs.existsSync(DATA_FILE)) {
  try {
    bosses = JSON.parse(fs.readFileSync(DATA_FILE));
  } catch {
    bosses = [];
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(bosses, null, 2));
}

function saveDashboard(id) {
  fs.writeFileSync(DASHBOARD_FILE, JSON.stringify({ id }));
}

function loadDashboard() {
  if (fs.existsSync(DASHBOARD_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DASHBOARD_FILE));
    } catch {
      return null;
    }
  }
  return null;
}

// ---------------- HELPERS ----------------
function formatMinutes(min) {
  if (min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function parseRespawn(input) {
  input = input.toLowerCase().trim();

  if (input.includes(':')) {
    const [h, m] = input.split(':').map(Number);
    return h * 60 + m;
  }

  let h = 0, m = 0;
  const hm = input.match(/(\d+)h/);
  const mm = input.match(/(\d+)m/);
  if (hm) h = parseInt(hm[1]);
  if (mm) m = parseInt(mm[1]);

  if (h > 0 || m > 0) return h * 60 + m;

  const plain = parseInt(input);
  return isNaN(plain) ? null : plain;
}

// ---------------- CALCUL NEXT SPAWN ----------------
// Returnează obiect { time: dayjs, key: string }
// key = ISO string unic per spawn — folosit pentru a nu notifica de 2 ori același spawn
function getNextSpawn(boss) {
  const now = dayjs.tz();
  let next = dayjs.tz(boss.firstSpawn);

  while (next.isBefore(now) || next.diff(now, 'second') < 0) {
    next = next.add(boss.respawn, 'minute');
  }

  return {
    time: next,
    key: next.toISOString()
  };
}

// ---------------- DASHBOARD ----------------
function buildDashboard() {
  const now = dayjs.tz();
  let description = '';

  if (bosses.length === 0) {
    description = 'Nu există boss-uri adăugate.';
  } else {
    bosses.forEach(boss => {
      const { time: next } = getNextSpawn(boss);
      const diff = next.diff(now, 'minute');
      const diffSec = next.diff(now, 'second');

      let status;
      if (diffSec <= 0) {
        status = '🔴 LIVE';
      } else if (diff < 10) {
        status = '🟠 Soon';
      } else {
        status = '🟢';
      }

      description += `${status} **${boss.name}**\n`;
      description += `⏰ ~${next.format('HH:mm')}\n`;
      description += `⏳ în ${diff > 0 ? formatMinutes(diff) : 'ACUM'}\n\n`;
    });
  }

  return new EmbedBuilder()
    .setTitle('📊 Boss Timer Dashboard')
    .setDescription(description.trim())
    .setColor(0xf1c40f)
    .setFooter({ text: 'Auto update • la fiecare 60s' })
    .setTimestamp();
}

async function updateDashboard() {
  if (!dashboardMessage) return;
  try {
    await dashboardMessage.edit({ embeds: [buildDashboard()] });
  } catch (err) {
    console.error('Eroare update dashboard:', err.message);
  }
}

// ---------------- COMENZI ----------------
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!boss')) return;

  const args = message.content.trim().split(/\s+/);
  const cmd = args[1];

  // !boss add Nume HH:MM respawn
  if (cmd === 'add') {
    const name = args[2];
    const time = args[3];
    const input = args[4];

    if (!name || !time || !input) {
      return message.reply('❌ Utilizare: `!boss add NumeBoss HH:MM respawn`\nEx: `!boss add Wubba 14:00 6:30`');
    }

    const respawn = parseRespawn(input);
    if (!respawn || isNaN(respawn) || respawn <= 0) {
      return message.reply('❌ Format respawn invalid. Ex: `6:30`, `6h30m`, `390`');
    }

    const now = dayjs.tz();
    const [h, m] = time.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) {
      return message.reply('❌ Format oră invalid. Ex: `14:00`');
    }

    let spawn = now.hour(h).minute(m).second(0).millisecond(0);
    if (spawn.isBefore(now)) spawn = spawn.add(1, 'day');

    bosses.push({
      name,
      firstSpawn: spawn.toISOString(),
      respawn
    });

    saveData();
    await updateDashboard();

    const { time: next } = getNextSpawn(bosses[bosses.length - 1]);
    const diff = next.diff(dayjs.tz(), 'minute');

    return message.reply(
      `✅ Boss **${name}** adăugat!\n` +
      `🔄 Respawn: ${formatMinutes(respawn)}\n` +
      `🕒 Următorul spawn: **~${next.format('HH:mm')}** (în ${formatMinutes(diff)})`
    );
  }

  // !boss list
  if (cmd === 'list') {
    if (bosses.length === 0) return message.reply('Nu există boss-uri adăugate.');

    const now = dayjs.tz();
    let txt = '**Boss-uri active:**\n';

    bosses.forEach((boss, i) => {
      const { time: next } = getNextSpawn(boss);
      const diff = next.diff(now, 'minute');
      txt += `**${i + 1}. ${boss.name}** → ~${next.format('HH:mm')} (în ${formatMinutes(diff)}) | Respawn: ${formatMinutes(boss.respawn)}\n`;
    });

    return message.reply(txt);
  }

  // !boss remove Nume
  if (cmd === 'remove') {
    const name = args[2];
    if (!name) return message.reply('❌ Utilizare: `!boss remove NumeBoss`');

    const index = bosses.findIndex(b => b.name.toLowerCase() === name.toLowerCase());
    if (index === -1) return message.reply(`❌ Boss-ul **${name}** nu există.`);

    const removed = bosses[index].name;
    bosses.splice(index, 1);
    delete notified[removed];
    saveData();
    await updateDashboard();

    return message.reply(`🗑️ Boss **${removed}** șters.`);
  }

  // !boss edit Nume HH:MM respawn
  if (cmd === 'edit') {
    const name = args[2];
    const time = args[3];
    const input = args[4];

    if (!name || !time || !input) {
      return message.reply('❌ Utilizare: `!boss edit NumeBoss HH:MM respawn`');
    }

    const index = bosses.findIndex(b => b.name.toLowerCase() === name.toLowerCase());
    if (index === -1) return message.reply(`❌ Boss-ul **${name}** nu există.`);

    const respawn = parseRespawn(input);
    if (!respawn || isNaN(respawn) || respawn <= 0) {
      return message.reply('❌ Format respawn invalid.');
    }

    const now = dayjs.tz();
    const [h, m] = time.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return message.reply('❌ Format oră invalid.');

    let spawn = now.hour(h).minute(m).second(0).millisecond(0);
    if (spawn.isBefore(now)) spawn = spawn.add(1, 'day');

    bosses[index] = { name: bosses[index].name, firstSpawn: spawn.toISOString(), respawn };
    delete notified[bosses[index].name];
    saveData();
    await updateDashboard();

    const { time: next } = getNextSpawn(bosses[index]);
    const diff = next.diff(now, 'minute');

    return message.reply(
      `✏️ Boss **${bosses[index].name}** actualizat!\n` +
      `🔄 Respawn: ${formatMinutes(respawn)}\n` +
      `🕒 Următorul spawn: **~${next.format('HH:mm')}** (în ${formatMinutes(diff)})`
    );
  }

  // !boss help
  if (cmd === 'help' || !cmd) {
    return message.reply(
      '**📖 Comenzi Boss Timer:**\n' +
      '`!boss add Nume HH:MM respawn` — Adaugă boss\n' +
      '`!boss list` — Listează boss-urile\n' +
      '`!boss remove Nume` — Șterge boss\n' +
      '`!boss edit Nume HH:MM respawn` — Editează boss\n\n' +
      '**Format respawn:** `6:30` sau `6h30m` sau `390` (minute)'
    );
  }
});

// ---------------- READY ----------------
client.once('ready', async () => {
  console.log(`✅ Bot online ca ${client.user.tag}`);

  channel = await client.channels.fetch(process.env.CHANNEL_ID);
  const saved = loadDashboard();

  if (saved?.id) {
    try {
      dashboardMessage = await channel.messages.fetch(saved.id);
      console.log('✅ Dashboard găsit, refolosit.');
    } catch {
      dashboardMessage = null;
      console.log('⚠️ Dashboard vechi nu a putut fi găsit, se creează unul nou.');
    }
  }

  if (!dashboardMessage) {
    dashboardMessage = await channel.send({ embeds: [buildDashboard()] });
    await dashboardMessage.pin().catch(() => {});
    saveDashboard(dashboardMessage.id);
    console.log('✅ Dashboard nou creat.');
  }

  // ─────────────────────────────────────────────────────────────
  // 🔔 NOTIFICĂRI — rulează la fiecare 30 secunde
  //
  // LOGICA CORECTĂ:
  //   - Calculăm next spawn pentru fiecare boss
  //   - Dacă e în fereastra [1min, 10min] ȘI nu am notificat deja
  //     pentru ACEST spawn specific (identificat prin key = ISO string),
  //     trimitem notificarea și salvăm key-ul
  //   - Când next spawn se schimbă (boss a spawnat, trecem la următorul),
  //     key-ul e diferit → se poate notifica din nou
  // ─────────────────────────────────────────────────────────────
  setInterval(async () => {
    const now = dayjs.tz();

    for (const boss of bosses) {
      const { time: next, key } = getNextSpawn(boss);
      const diffSec = next.diff(now, 'second');
      const diffMin = Math.ceil(diffSec / 60);

      // Fereastra de notificare: între 1 și 10 minute înainte
      const inWindow = diffSec > 0 && diffMin <= 10;

      if (inWindow && notified[boss.name] !== key) {
        // Trimite notificare
        try {
          await channel.send(
            `⚔️ **${boss.name}** spawn în **${diffMin} minute**! (~${next.format('HH:mm')})`
          );
          notified[boss.name] = key; // Marchează spawn-ul curent ca notificat
          console.log(`🔔 Notificat: ${boss.name} la ${next.format('HH:mm')}`);
        } catch (err) {
          console.error(`Eroare notificare ${boss.name}:`, err.message);
        }
      }

      // Dacă spawn-ul pentru care am notificat a trecut deja, resetăm
      // (key-ul va fi diferit la următorul getNextSpawn, deci se auto-resetează)
    }
  }, 30_000);

  // 📊 DASHBOARD — update la fiecare 60 secunde
  setInterval(updateDashboard, 60_000);

  // Update imediat la start
  await updateDashboard();
});

client.login(process.env.TOKEN);
