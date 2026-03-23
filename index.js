const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const dayjs = require('dayjs');
const fs = require('fs');

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
const notified = {};

// ---------------- LOAD ----------------
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

// ---------------- DASHBOARD SAVE ----------------
function saveDashboard(id) {
  fs.writeFileSync(DASHBOARD_FILE, JSON.stringify({ id }));
}

function loadDashboard() {
  if (fs.existsSync(DASHBOARD_FILE)) {
    return JSON.parse(fs.readFileSync(DASHBOARD_FILE));
  }
  return null;
}

// ---------------- HELPERS ----------------
function formatMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;

  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function parseRespawn(input) {
  input = input.toLowerCase();

  if (input.includes(':')) {
    const [h, m] = input.split(':').map(Number);
    return h * 60 + m;
  }

  if (input.includes('h') || input.includes('m')) {
    let h = 0, m = 0;
    const hm = input.match(/(\d+)h/);
    const mm = input.match(/(\d+)m/);

    if (hm) h = parseInt(hm[1]);
    if (mm) m = parseInt(mm[1]);

    return h * 60 + m;
  }

  return parseInt(input);
}

// ---------------- DASHBOARD ----------------
function buildDashboard() {
  const now = dayjs();
  let description = '';

  bosses.forEach(boss => {
    let next = dayjs(boss.firstSpawn);

    while (next.isBefore(now)) {
      next = next.add(boss.respawn, 'minute');
    }

    const diff = next.diff(now, 'minute');

    let status = '🟢';
    if (diff <= 1) status = '🔴 LIVE';
    else if (diff <= 10) status = '🔴 Soon';

    description += `${status} **${boss.name}**\n`;
    description += `⏰ ~${next.format('HH:mm')}\n`;
    description += `⏳ în ${formatMinutes(diff)}\n\n`;
  });

  if (!description) description = 'Nu există boss-uri.';

  return new EmbedBuilder()
    .setTitle('📊 Boss Timer Dashboard')
    .setDescription(description)
    .setColor(0xf1c40f)
    .setFooter({ text: 'Auto update live' })
    .setTimestamp();
}

// ---------------- NOTIFICĂRI ----------------
setInterval(() => {
  const now = dayjs();

  bosses.forEach(boss => {
    let next = dayjs(boss.firstSpawn);

    while (next.isBefore(now)) {
      next = next.add(boss.respawn, 'minute');
    }

    const diff = next.diff(now, 'minute');

    if (diff === 10 && !notified[boss.name]) {
      const channel = client.channels.cache.get(process.env.CHANNEL_ID);
      if (channel) {
        channel.send(`⚔️ ${boss.name} spawn în 10 minute! (~${next.format('HH:mm')})`);
      }
      notified[boss.name] = true;
    }

    if (diff <= 0) notified[boss.name] = false;
  });

}, 60000);

// ---------------- DASHBOARD UPDATE ----------------
setInterval(async () => {
  if (!dashboardMessage) return;

  try {
    await dashboardMessage.edit({
      embeds: [buildDashboard()]
    });
  } catch (e) {
    console.log("Dashboard error:", e);
  }
}, 60000);

// ---------------- COMMANDS ----------------
client.on('messageCreate', async (message) => {
  if (!message.content.startsWith('!boss')) return;

  const args = message.content.split(' ');
  const cmd = args[1];

  // ADD
  if (cmd === 'add') {
    const name = args[2];
    const time = args[3];
    const input = args[4];

    if (!name || !time || !input) {
      return message.reply("❌ !boss add Nume 14:00 6:30");
    }

    const respawn = parseRespawn(input);

    if (!respawn || isNaN(respawn)) {
      return message.reply("❌ Format invalid");
    }

    const now = dayjs();
    const [h, m] = time.split(':').map(Number);

    let spawn = now.hour(h).minute(m).second(0);

    if (spawn.isBefore(now)) spawn = spawn.add(1, 'day');

    bosses.push({
      name,
      firstSpawn: spawn.toISOString(),
      respawn
    });

    saveData();

    let next = spawn;
    while (next.isBefore(dayjs())) {
      next = next.add(respawn, 'minute');
    }

    message.reply(
      `✅ Boss **${name}** adăugat (${formatMinutes(respawn)})\n` +
      `🕒 Următorul spawn: ~${next.format('HH:mm')}`
    );
  }

  // LIST
  if (cmd === 'list') {
    if (bosses.length === 0) return message.reply('Nu există boss-uri.');

    let txt = '';

    bosses.forEach(boss => {
      let next = dayjs(boss.firstSpawn);

      while (next.isBefore(dayjs())) {
        next = next.add(boss.respawn, 'minute');
      }

      const diff = next.diff(dayjs(), 'minute');

      txt += `**${boss.name}** → ~${next.format('HH:mm')} (în ${formatMinutes(diff)})\n`;
    });

    message.reply(txt);
  }

  // REMOVE
  if (cmd === 'remove') {
    const name = args[2];

    const index = bosses.findIndex(b => b.name.toLowerCase() === name.toLowerCase());

    if (index === -1) {
      return message.reply("❌ Nu există.");
    }

    bosses.splice(index, 1);
    saveData();

    message.reply(`🗑️ ${name} șters`);
  }
});

// ---------------- READY ----------------
client.once('ready', async () => {
  console.log(`Bot online ca ${client.user.tag}`);

  const channel = await client.channels.fetch(process.env.CHANNEL_ID);
  const saved = loadDashboard();

  try {
    if (saved?.id) {
      dashboardMessage = await channel.messages.fetch(saved.id);
    }
  } catch {
    dashboardMessage = null;
  }

  if (!dashboardMessage) {
    dashboardMessage = await channel.send({
      embeds: [buildDashboard()]
    });

    await dashboardMessage.pin();
    saveDashboard(dashboardMessage.id);
  }
});

client.login(process.env.TOKEN);
