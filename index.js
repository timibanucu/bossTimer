const { Client, GatewayIntentBits } = require('discord.js');
const dayjs = require('dayjs');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const bosses = [];
const notified = {}; // ca să nu trimită spam

// 🔔 CHECK la fiecare minut
setInterval(() => {
  const now = dayjs();

  bosses.forEach(boss => {
    let next = boss.firstSpawn;

    while (next.isBefore(now)) {
      next = next.add(boss.respawn, 'hour');
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

}, 60000); // la fiecare minut

// ---------------- COMMANDS ----------------

client.on('messageCreate', async (message) => {
  if (!message.content.startsWith('!boss')) return;

  const args = message.content.split(' ');

  if (args[1] === 'add') {
    const name = args[2];
    const time = args[3];
    const respawn = parseInt(args[4]);

    const now = dayjs();
    const [hour, minute] = time.split(':');

    let spawn = now.hour(hour).minute(minute).second(0);

    if (spawn.isBefore(now)) {
      spawn = spawn.add(1, 'day');
    }

    bosses.push({ name, firstSpawn: spawn, respawn });

    message.reply(`✅ Boss ${name} adăugat.`);
  }

  if (args[1] === 'list') {
    let reply = '';

    bosses.forEach(boss => {
      const now = dayjs();
      let next = boss.firstSpawn;

      while (next.isBefore(now)) {
        next = next.add(boss.respawn, 'hour');
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
