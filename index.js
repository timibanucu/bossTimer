const { Client, GatewayIntentBits } = require('discord.js');
const dayjs = require('dayjs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const bosses = [];
const notified = {};

// 🔧 FORMAT MINUTE → h + m
function formatMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;

  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

// 🔧 PARSE RESPAWN
function parseRespawn(input) {
  input = input.toLowerCase();

  let respawn;

  if (input.includes(':')) {
    const [h, m] = input.split(':').map(Number);
    respawn = (h * 60) + m;
  } else if (input.includes('h') || input.includes('m')) {
    let hours = 0;
    let minutes = 0;

    const hMatch = input.match(/(\d+)h/);
    const mMatch = input.match(/(\d+)m/);

    if (hMatch) hours = parseInt(hMatch[1]);
    if (mMatch) minutes = parseInt(mMatch[1]);

    respawn = (hours * 60) + minutes;
  } else {
    respawn = parseInt(input);
  }

  return respawn;
}

// 🔔 CHECK notificări
setInterval(() => {
  const now = dayjs();

  bosses.forEach(boss => {
    let next = boss.firstSpawn;

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

    if (diff <= 0) {
      notified[boss.name] = false;
    }
  });

}, 60000);

// ---------------- COMMANDS ----------------

client.on('messageCreate', async (message) => {
  if (!message.content.startsWith('!boss')) return;

  const args = message.content.split(' ');
  const command = args[1];

  // ➕ ADD
  if (command === 'add') {
    const name = args[2];
    const time = args[3];
    const input = args[4];

    if (!name || !time || !input) {
      return message.reply("❌ Folosește: !boss add Nume 14:00 6:30");
    }

    const respawn = parseRespawn(input);

    if (!respawn || isNaN(respawn)) {
      return message.reply("❌ Format invalid. Exemple: 6:30, 45m, 6h30m");
    }

    const now = dayjs();
    const [hour, minute] = time.split(':').map(Number);

    let spawn = now.hour(hour).minute(minute).second(0);

    if (spawn.isBefore(now)) {
      spawn = spawn.add(1, 'day');
    }

    bosses.push({ name, firstSpawn: spawn, respawn });

    let next = spawn;

    while (next.isBefore(dayjs())) {
      next = next.add(respawn, 'minute');
    }

    message.reply(
      `✅ Boss **${name}** adăugat (${formatMinutes(respawn)})\n` +
      `🕒 Următorul spawn: ~${next.format('HH:mm')}`
    );
  }

  // 📋 LIST
  if (command === 'list') {
    let reply = '';

    bosses.forEach(boss => {
      const now = dayjs();
      let next = boss.firstSpawn;

      while (next.isBefore(now)) {
        next = next.add(boss.respawn, 'minute');
      }

      reply += `**${boss.name}** → ~${next.format('HH:mm')} (${formatMinutes(boss.respawn)})\n`;
    });

    message.reply(reply || 'Nu există boss-uri.');
  }

  // ❌ REMOVE
  if (command === 'remove') {
    const name = args[2];

    if (!name) {
      return message.reply("❌ Folosește: !boss remove Nume");
    }

    const index = bosses.findIndex(b => b.name.toLowerCase() === name.toLowerCase());

    if (index === -1) {
      return message.reply(`❌ Boss **${name}** nu există.`);
    }

    bosses.splice(index, 1);
    delete notified[name];

    message.reply(`🗑️ Boss **${name}** a fost șters.`);
  }
});

client.once('ready', () => {
  console.log(`Bot online ca ${client.user.tag}`);
});

client.login(process.env.TOKEN);
