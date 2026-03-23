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

// 🔧 FUNCȚIE PARSE RESPAWN
function parseRespawn(input) {
  input = input.toLowerCase();

  let respawn;

  // format 6:30
  if (input.includes(':')) {
    const [h, m] = input.split(':').map(Number);
    respawn = (h * 60) + m;
  }

  // format 6h30m / 6h / 30m
  else if (input.includes('h') || input.includes('m')) {
    let hours = 0;
    let minutes = 0;

    const hMatch = input.match(/(\d+)h/);
    const mMatch = input.match(/(\d+)m/);

    if (hMatch) hours = parseInt(hMatch[1]);
    if (mMatch) minutes = parseInt(mMatch[1]);

    respawn = (hours * 60) + minutes;
  }

  // doar număr → minute
  else {
    respawn = parseInt(input);
  }

  return respawn;
}

// 🔔 CHECK la fiecare minut
setInterval(() => {
  const now = dayjs();

  bosses.forEach(boss => {
    let next = boss.firstSpawn;

    while (next.isBefore(now)) {
      next = next.add(boss.respawn, 'minute');
    }

    const diff = next.diff(now, 'minute');

    // notificare la 10 minute
    if (diff === 10 && !notified[boss.name]) {
      const channel = client.channels.cache.get(process.env.CHANNEL_ID);

      if (channel) {
        channel.send(`⚔️ ${boss.name} spawn în 10 minute! (~${next.format('HH:mm')})`);
      }

      notified[boss.name] = true;
    }

    // reset după spawn
    if (diff <= 0) {
      notified[boss.name] = false;
    }
  });

}, 60000);

// ---------------- COMMANDS ----------------

client.on('messageCreate', async (message) => {
  if (!message.content.startsWith('!boss')) return;

  const args = message.content.split(' ');

  // ➕ ADD
  if (args[1] === 'add') {
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

    message.reply(`✅ Boss **${name}** adăugat (${respawn} min respawn).`);
  }

  // 📋 LIST
  if (args[1] === 'list') {
    let reply = '';

    bosses.forEach(boss => {
      const now = dayjs();
      let next = boss.firstSpawn;

      while (next.isBefore(now)) {
        next = next.add(boss.respawn, 'minute');
      }

      reply += `**${boss.name}** → ~${next.format('HH:mm')}\n`;
    });

    message.reply(reply || 'Nu există boss-uri.');
  }
});

client.once('ready', () => {
  console.log(`Bot online ca ${client.user.tag}`);
});

client.login(process.env.TOKEN);
