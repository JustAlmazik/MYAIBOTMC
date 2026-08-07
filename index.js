const mineflayer = require('mineflayer');
const express = require('express');
const axios = require('axios');

// 1. Веб-сервер для UptimeRobot, чтобы хостинг не усыпал
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is alive and running!');
});

app.listen(PORT, () => {
  console.log(`Web server is listening on port ${PORT}`);
});

// 2. Подключение бота к вашему Aternos серверу
const bot = mineflayer.createBot({
  host: 'atmosph_survival.aternos.me',
  port: 25565, 
  username: 'AIBot',
  version: '1.20.1'
});

bot.on('spawn', () => {
  console.log('Бот успешно зашел на сервер!');
  bot.chat('Всем привет! Я ИИ-компаньон, пишите !ai [текст] для общения со мной.');
});

bot.on('chat', async (username, message) => {
  if (username === bot.username) return;
  
  if (message.startsWith('!ai')) {
    const prompt = message.replace('!ai', '').trim();
    if (!prompt) return;

    try {
      // Запрос к API Groq (модель Llama 3.3 70B)
      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Ты друг-игрок в Minecraft на выживании. Общайся коротко, дружелюбно и по-русски, как обычный пацан в чате игры. Не пиши слишком длинно.' },
          { role: 'user', content: `${username} говорит тебе: ${prompt}` }
        ],
      }, {
        headers: {
          'Authorization': `Bearer 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`,
          'Content-Type': 'application/json'
        }
      });

      const aiReply = response.data.choices[0].message.content;
      
      // Убираем переносы строк для майнкрафт-чата
      const cleanReply = aiReply.replace(/[\r\n]+/g, ' ');
      bot.chat(cleanReply);

    } catch (error) {
      console.error('Ошибка запроса к нейросети:', error.response ? error.response.data : error.message);
      bot.chat(`${username}, у меня что-то мозг заклинило, не смог ответить.`);
    }
  }
});

bot.on('end', (reason) => {
  console.log(`Бот отключился: ${reason}. Переподключение через 5 секунд...`);
  setTimeout(() => {
    process.exit(1); 
  }, 5000);
});

bot.on('error', (err) => {
  console.log('Ошибка бота:', err);
});
