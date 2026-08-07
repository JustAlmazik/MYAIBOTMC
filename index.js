const mineflayer = require('mineflayer');
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is active'));
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

const bot = mineflayer.createBot({
  host: 'dynamic-10.magmanode.com',
  port: 25790,
  username: 'AIBot',
  version: '1.20.1',
  auth: 'offline'
});

let following = false;
let followInterval = null;

bot.on('spawn', () => {
  console.log('Бот успешно вошел на сервер!');
  bot.chat('Всем здарова! Я готов бегать за вами. Напишите !следуй');
});

bot.on('chat', async (username, message) => {
  if (username === bot.username) return;

  const msg = message.toLowerCase().trim();

  // Команда следования
  if (msg.startsWith('!следуй')) {
    const targetPlayer = bot.players[username]?.entity;
    if (!targetPlayer) {
      bot.chat(`${username}, я тебя не вижу рядом!`);
      return;
    }

    bot.chat(`Бегу за тобой, ${username}!`);
    following = true;

    if (followInterval) clearInterval(followInterval);

    followInterval = setInterval(() => {
      const target = bot.players[username]?.entity;
      if (!following || !target) {
        clearInterval(followInterval);
        bot.clearControlStates();
        return;
      }

      // Смотрим на игрока и идем вперед
      bot.lookAt(target.position.offset(0, target.height, 0));
      const distance = bot.entity.position.distanceTo(target.position);

      if (distance > 3) {
        bot.setControlState('forward', true);
        bot.setControlState('sprint', true);
        if (target.position.y > bot.entity.position.y + 0.5) {
          bot.setControlState('jump', true);
        } else {
          bot.setControlState('jump', false);
        }
      } else {
        bot.setControlState('forward', false);
        bot.setControlState('sprint', false);
        bot.setControlState('jump', false);
      }
    }, 200);
    return;
  }

  // Команда стоп
  if (msg.startsWith('!стоп')) {
    following = false;
    if (followInterval) clearInterval(followInterval);
    bot.clearControlStates();
    bot.chat('Стою на месте!');
    return;
  }

  // Общий ИИ-ответ в чат
  try {
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'Ты реальный игрок в Minecraft. Общайся сленгом геймеров, коротко и по-русски.' },
        { role: 'user', content: `${username} говорит: ${message}` }
      ]
    }, {
      headers: { 'Authorization': 'Bearer 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' }
    });

    const reply = response.data.choices[0].message.content.replace(/[\r\n]+/g, ' ');
    bot.chat(reply);
  } catch (err) {
    console.error('Ошибка Groq API:', err.message);
  }
});

bot.on('end', (reason) => {
  console.log(`Дисконнект: ${reason}. Переподключение...`);
  setTimeout(() => process.exit(1), 5000);
});

bot.on('error', (err) => console.log('Ошибка:', err));
