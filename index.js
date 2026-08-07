const mineflayer = require('mineflayer');
const express = require('express');

// 1. Создаем простой веб-сервер для UptimeRobot, чтобы хостинг не засыпал
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is alive and running!');
});

app.listen(PORT, () => {
  console.log(`Web server is listening on port ${PORT}`);
});

// 2. Подключение бота к твоему Aternos серверу
const bot = mineflayer.createBot({
  host: 'atmosph_survival.aternos.me',
  port: 25565, // Если у тебя на Aternos другой порт, замени на число из цифр (например, 12345)
  username: 'AIBot',
  version: '1.20.1'
});

bot.on('spawn', () => {
  console.log('Бот успешно зашел на сервер!');
  bot.chat('Всем привет! Я ИИ-компаньон, пишите !ai [текст] для общения со мной.');
});

bot.on('chat', (username, message) => {
  if (username === bot.username) return;
  
  if (message.startsWith('!ai')) {
    const prompt = message.replace('!ai', '').trim();
    
    // Сюда можно подключить запрос к OpenAI / DeepSeek / другой нейросети
    bot.chat(`${username}, я получил твое сообщение: "${prompt}"`);
  }
});

bot.on('end', (reason) => {
  console.log(`Бот отключился: ${reason}. Переподключение через 5 секунд...`);
  setTimeout(() => {
    // Автоматический ресонект, если Aternos выключился или кикнул
    process.exit(1); 
  }, 5000);
});

bot.on('error', (err) => {
  console.log('Ошибка бота:', err);
});
