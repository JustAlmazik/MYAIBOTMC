const mineflayer = require('mineflayer');
const express = require('express');
const axios = require('axios');

// Веб-сервер для поддержания активности на Render
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is active'));
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

// Настройки подключения к Server.pro
const bot = mineflayer.createBot({
  host: 'aiservermc.lets.game',
  port: 2000,          // Твой порт с Server.pro
  username: 'AIBot',
  version: '1.20.1',   // Убедись, что на сервере 1.20.1
  auth: 'offline'
});

bot.on('spawn', () => {
  console.log('Бот успешно вошел в мир!');
  bot.chat('Всем привет! Я ИИ-бот. Пишите !ai [вопрос] для связи.');
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
          { role: 'system', content: 'Ты ИИ-игрок в Майнкрафт. Пиши коротко, дружелюбно, на русском.' },
          { role: 'user', content: `${username} говорит: ${prompt}` }
        ]
      }, {
        headers: { 'Authorization': 'Bearer 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' }
      });

      const reply = response.data.choices[0].message.content.replace(/[\r\n]+/g, ' ');
      bot.chat(reply);
    } catch (err) {
      console.error('Ошибка Groq API:', err.message);
      bot.chat('Я сейчас не могу ответить, попробуй позже.');
    }
  }
});

// Авто-переподключение
bot.on('end', (reason) => {
  console.log(`Дисконнект: ${reason}. Рестарт через 5 секунд...`);
  setTimeout(() => process.exit(1), 5000);
});

bot.on('error', (err) => console.log('Ошибка бота:', err));
