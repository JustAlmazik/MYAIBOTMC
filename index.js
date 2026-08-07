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

// При появлении на сервере
bot.on('spawn', async () => {
  console.log('Бот успешно вошел на сервер!');
  bot.chat('Всем привет! Я в деле. Копаю землю и охочусь на овец!');

  // Добываем пару блоков земли сразу после спавна
  for (let i = 0; i < 2; i++) {
    try {
      const dirt = bot.findBlock({ 
        matching: (b) => b && (b.name === 'dirt' || b.name === 'grass_block'), 
        maxDistance: 5 
      });
      if (dirt) {
        await bot.dig(dirt);
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err) {
      console.log('Не удалось срубить блок земли при спавне');
    }
  }
});

// Периодическая проверка овец в радиусе 20 блоков (каждые 5 секунд)
setInterval(() => {
  if (!bot.entity) return;
  const sheep = bot.nearestEntity((e) => e.type === 'mob' && e.mobType === 'Sheep' && e.position.distanceTo(bot.entity.position) < 20);
  if (sheep) {
    bot.lookAt(sheep.position);
    bot.attack(sheep);
  }
}, 5000);

// Обработка чата и команд
bot.on('chat', async (username, message) => {
  if (username === bot.username) return;

  const msg = message.toLowerCase().trim();

  // --- КОМАНДА: ДОБЫВАЙ ДОСКИ / РУБИ ДЕРЕВО ---
  if (msg.includes('добывай доски') || msg.includes('руби дерево')) {
    bot.chat('Окей, сейчас добуду дерево!');
    
    const woodBlock = bot.findBlock({
      matching: (block) => block && block.name.includes('log'),
      maxDistance: 10
    });

    if (!woodBlock) {
      bot.chat('Я ничего не вижу поблизости в радиусе 10 блоков :(');
      return;
    }

    bot.lookAt(woodBlock.position);
    
    const moveInterval = setInterval(() => {
      if (!bot.entity) {
        clearInterval(moveInterval);
        return;
      }
      const dist = bot.entity.position.distanceTo(woodBlock.position);
      if (dist > 3) {
        bot.setControlState('forward', true);
        bot.setControlState('sprint', true);
        if (woodBlock.position.y > bot.entity.position.y + 0.5) {
          bot.setControlState('jump', true);
        }
      } else {
        bot.setControlState('forward', false);
        bot.setControlState('sprint', false);
        bot.setControlState('jump', false);
        clearInterval(moveInterval);
        
        bot.dig(woodBlock, (err) => {
          if (err) {
            bot.chat('Не получилось срубить дерево!');
            return;
          }
          bot.chat('Готово, дерево мое!');
        });
      }
    }, 200);
    return;
  }

  // --- КОМАНДА: СЛЕДУЙ ---
  if (msg.startsWith('!следуй') || msg.includes('иди за мной')) {
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
      if (!following || !target || !bot.entity) {
        clearInterval(followInterval);
        bot.clearControlStates();
        return;
      }

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

  // --- КОМАНДА: СТОП ---
  if (msg.startsWith('!стоп') || msg === 'стой') {
    following = false;
    if (followInterval) clearInterval(followInterval);
    bot.clearControlStates();
    bot.chat('Стою на месте!');
    return;
  }

  // --- ОБЩИЙ ИИ-ОТВЕТ ЧЕРЕЗ GROQ API ---
  try {
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'Ты игрок в Minecraft. Общайся коротко, дружелюбно и по-русски.' },
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
