const mineflayer = require('mineflayer');
const express = require('express');
const axios = require('axios');

// Веб-сервер для UptimeRobot, чтобы Render не усыплял бота
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is online!'));
app.listen(PORT, () => console.log(`Web server on port ${PORT}`));

// Настройки подключения
const bot = mineflayer.createBot({
  host: 'aiservervanillalol.aternos.me',
  port: 25565,
  username: 'AIBot',
  version: '1.20.1',
  auth: 'offline' // Важно для пиратского сервера
});

bot.on('spawn', () => {
  console.log('Бот успешно зашел на сервер!');
  bot.chat('Всем привет! Я ИИ-бот. Пишите !ai [вопрос] чтобы пообщаться.');
});

bot.on('chat', async (username, message) => {
  if (username === bot.username) return;

  if (message.startsWith('!ai')) {
    const prompt = message.replace('!ai', '').trim();
    if (!prompt) return;

    try {
      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Ты друг-игрок в Minecraft. Общайся дружелюбно, коротко и по-русски.' },
          { role: 'user', content: `${username} говорит: ${prompt}` }
        ]
      }, {
        headers: { 'Authorization': 'Bearer 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' }
      });

      const reply = response.data.choices[0].message.content.replace(/[\r\n]+/g, ' ');
      bot.chat(reply);
    } catch (err) {
      console.error(err);
      bot.chat('Ой, я забыл как думать... попробуй еще раз.');
    }
  }
});

// Авто-переподключение при дисконнекте
bot.on('end', (reason) => {
  console.log(`Отключен: ${reason}. Рестарт через 5 секунд...`);
  setTimeout(() => process.exit(1), 5000);
});

bot.on('error', (err) => console.log('Ошибка:', err));
