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

// Функция для поиска и рубки дерева автономно
function autoCutWood() {
  const woodBlock = bot.findBlock({
    matching: (block) => block && block.name.includes('log'),
    maxDistance: 10
  });

  if (!woodBlock) return;

  bot.chat('Нашла дерево, иду рубить!');
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
        if (!err) {
          bot.chat('Срубила брусчатку/дерево!');
        }
      });
    }
  }, 200);
}

bot.on('spawn', async () => {
  console.log('Бот успешно вошел на сервер!');
  bot.chat('Всем привет! Я в деле, иду здороваться!');

  // Сразу после спавна: находим игрока, подходим, шифтимся и даем ресурсы
  setTimeout(async () => {
    const playerEntries = Object.values(bot.players).filter(p => p.username !== bot.username && p.entity);
    if (playerEntries.length > 0) {
      const targetPlayer = playerEntries[0].entity;
      bot.chat(`Привет, ${playerEntries[0].username}! Держи подарок.`);

      // Идем к игроку
      const approachInterval = setInterval(() => {
        if (!targetPlayer || !bot.entity) {
          clearInterval(approachInterval);
          return;
        }
        bot.lookAt(targetPlayer.position.offset(0, targetPlayer.height, 0));
        const dist = bot.entity.position.distanceTo(targetPlayer.position);
        if (dist > 3) {
          bot.setControlState('forward', true);
        } else {
          bot.setControlState('forward', false);
          clearInterval(approachInterval);

          // Шифтимся пару раз (приседаем)
          let shiftCount = 0;
          const shiftInterval = setInterval(async () => {
            shiftCount++;
            bot.setControlState('sneak', true);
            await new Promise(r => setTimeout(r, 400));
            bot.setControlState('sneak', false);
            
            if (shiftCount >= 2) {
              clearInterval(shiftInterval);
              // Пробуем выбросить предмет из инвентаря (если есть земля/дерево)
              const itemToDrop = bot.inventory.items().find(item => item.name.includes('dirt') || item.name.includes('log'));
              if (itemToDrop) {
                bot.toss(itemToDrop.type, null, 1, (err) => {
                  if (!err) bot.chat('Вот тебе ресы!');
                });
              }
            }
          }, 800);
        }
      }, 200);
    }
  }, 3000);
});

// Автономные задачи (каждые 30 секунд рубит дерево, каждые 7 секунд бьет овец)
setInterval(() => {
  if (following) return; // если идет за кем-то, не отвлекаемся
  autoCutWood();
}, 30000);

setInterval(() => {
  if (!bot.entity) return;
  const sheep = bot.nearestEntity((e) => e.type === 'mob' && e.mobType === 'Sheep' && e.position.distanceTo(bot.entity.position) < 20);
  if (sheep) {
    bot.lookAt(sheep.position);
    bot.attack(sheep);
  }
}, 7000);

// Чат и команды
bot.on('chat', async (username, message) => {
  if (username === bot.username) return;
  const msg = message.toLowerCase().trim();

  // Команда следования
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

  // Команда стоп
  if (msg.startsWith('!стоп') || msg === 'стой') {
    following = false;
    if (followInterval) clearInterval(followInterval);
    bot.clearControlStates();
    bot.chat('Стою на месте!');
    return;
  }

  // Общий ИИ-ответ
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
