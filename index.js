const mineflayer = require('mineflayer');
const { pathfinding, Movements, goals } = require('mineflayer-pathfinding');
const express = require('express');
const axios = require('axios');

// Веб-сервер для Render (чтобы хостинг не усыплял бота)
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

// Подключаем плагин для навигации
bot.loadPlugin(pathfinding);

let isWorking = false;

bot.on('spawn', () => {
  console.log('Бот успешно вошел на сервер!');
  bot.chat('Всем здарова! Я тут. Напишите !помощь или команду для меня.');

  // Бот пишет сам в чат каждые 3-4 минуты, если ему скучно
  setInterval(() => {
    if (!isWorking) {
      const phrases = [
        'Эй, кто со мной рубить дерево?',
        'Мне скучно, погнали исследовать шахту или строить дом!',
        'Народ, кто тут? Дайте знать!',
        'Кто построит красивый дом рядом со мной?'
      ];
      const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
      bot.chat(randomPhrase);
    }
  }, 200000); // примерно 3.5 минуты
});

// Обработка чата
bot.on('chat', async (username, message) => {
  if (username === bot.username) return;

  const args = message.split(' ');
  const cmd = args[0].toLowerCase();
  const textArg = args.slice(1).join(' ');

  // Команда следования: "иди за мной" или "!следуй"
  if (message.toLowerCase().includes('иди за мной') || cmd === '!следуй') {
    const player = bot.players[username];
    if (!player || !player.entity) {
      bot.chat(`${username}, я тебя не вижу поблизости!`);
      return;
    }
    bot.chat(`${username}, иду за тобой!`);
    isWorking = true;
    
    const movements = new Movements(bot);
    bot.pathfinding.setMovements(movements);

    function followPlayer() {
      if (!player.entity) return;
      const p = player.entity.position;
      bot.pathfinding.goto(new goals.GoalFollow(player.entity, 2))
        .catch(() => {});
    }
    
    // Каждую секунду обновляем позицию следования за игроком
    const followInterval = setInterval(() => {
      if (!isWorking) {
        clearInterval(followInterval);
        return;
      }
      followPlayer();
    }, 1000);
    return;
  }

  // Остановить бота: "стой" или "!стоп"
  if (cmd === '!стоп' || message.toLowerCase() === 'стой') {
    isWorking = false;
    bot.pathfinding.stop();
    bot.chat('Стою на месте!');
    return;
  }

  // Команда добычи дерева: "!дерево"
  if (cmd === '!дерево') {
    bot.chat('Ищу ближайшее дерево для рубки...');
    isWorking = true;
    try {
      const movements = new Movements(bot);
      bot.pathfinding.setMovements(movements);

      // Ищем блок дуба, березы, ели и т.д. в радиусе 32 блоков
      const block = bot.findBlock({
        matching: block => block && block.name.includes('log'),
        maxDistance: 32
      });

      if (!block) {
        bot.chat('Поблизости нет деревьев!');
        isWorking = false;
        return;
      }

      await bot.pathfinding.goto(new goals.GoalToBlock(block.position.x, block.position.y, block.position.z));
      await bot.dig(block);
      bot.chat('Я срубил блок дерева! Готов работать дальше.');
    } catch (err) {
      console.log(err);
      bot.chat('Не получилось срубить дерево...');
    }
    isWorking = false;
    return;
  }

  // Общий ИИ-ответ на любые другие вопросы через Groq API
  if (cmd === '!ai' || message.startsWith('ai!') || !message.startsWith('!')) {
    const prompt = message.replace('!ai', '').replace('ai!', '').trim();
    if (!prompt && message.startsWith('!')) return;

    try {
      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Ты реальный игрок в Minecraft. Общайся сленгом геймеров, коротко, дружелюбно, по-русски. Ты можешь ходить за игроком по команде "!следуй" и рубить дерево по команде "!дерево".' },
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
  }
});

bot.on('end', (reason) => {
  console.log(`Дисконнект: ${reason}. Переподключение...`);
  setTimeout(() => process.exit(1), 5000);
});

bot.on('error', (err) => console.log('Ошибка:', err));
