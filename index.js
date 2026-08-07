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

bot.on('spawn', () => {
  console.log('Бот успешно вошел на сервер!');
  bot.chat('Всем здарова! Я тут. Напишите что-нибудь в чат.');

  // Инициатива: бот сам пишет в чат каждые 3 минуты
  setInterval(() => {
    const phrases = [
      'Эй, кто со мной рубить дерево?',
      'Мне скучно, погнали исследовать мир!',
      'Народ, кто тут? Дайте знать!',
      'Кто построит красивый дом рядом со мной?'
    ];
    const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
    bot.chat(randomPhrase);
  }, 180000);
});

bot.on('chat', async (username, message) => {
  if (username === bot.username) return;

  const lowerMsg = message.toLowerCase();

  // Команда следования
  if (lowerMsg.includes('иди за мной') || lowerMsg === '!следуй') {
    const target = bot.players[username]?.entity;
    if (!target) {
      bot.chat(`${username}, я тебя не вижу!`);
      return;
    }
    bot.chat(`${username}, иду за тобой!`);
    bot.lookAt(target.position);
    bot.setControlState('forward', true);
    return;
  }

  // Команда остановки
  if (lowerMsg === '!стоп' || lowerMsg === 'стой') {
    bot.clearControlStates();
    bot.chat('Стою на месте!');
    return;
  }

  // Общий ИИ-ответ через Groq API
  try {
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'Ты реальный игрок в Minecraft. Общайся сленгом геймеров, коротко, дружелюбно, по-русски.' },
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
