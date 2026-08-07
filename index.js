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

let botState = 'wandering'; // wandering, approaching, cutting, crafting, building, returning
let basePosition = null;

bot.on('spawn', () => {
  console.log('Бот успешно вошел на сервер!');
  basePosition = bot.entity.position.clone(); // Запоминаем точку старта как базу
  bot.chat('Всем привет! Я начинаю строить свою базу и жить своей жизнью!');
});

// Основной цикл поведения бота (каждую секунду)
setInterval(async () => {
  if (!bot.entity) return;

  // 1. Если бот просто бродит по миру
  if (botState === 'wandering') {
    // Случайное движение и повороты
    if (Math.random() < 0.1) {
      bot.look(Math.random() * Math.PI * 2, 0);
    }
    bot.setControlState('forward', true);
    bot.setControlState('sprint', true);

    // Проверяем, есть ли рядом игроки, чтобы подойти
    const playerEntries = Object.values(bot.players).filter(p => p.username !== bot.username && p.entity);
    if (playerEntries.length > 0 && Math.random() < 0.3) {
      const targetPlayer = playerEntries[0].entity;
      if (bot.entity.position.distanceTo(targetPlayer.position) < 15) {
        botState = 'approaching';
        handleApproachPlayer(targetPlayer);
        return;
      }
    }

    // Иногда решаем заняться добычей дерева
    if (Math.random() < 0.15) {
      botState = 'cutting';
      bot.setControlState('forward', false);
      bot.setControlState('sprint', false);
      autoSurvivalLoop();
    }
  }
}, 1000);

// Функция приближения к игроку
function handleApproachPlayer(targetPlayer) {
  bot.chat('О, привет! Ищу тебя.');
  const approachInterval = setInterval(() => {
    if (!targetPlayer || !bot.entity || botState !== 'approaching') {
      clearInterval(approachInterval);
      botState = 'wandering';
      return;
    }
    bot.lookAt(targetPlayer.position.offset(0, targetPlayer.height, 0));
    const dist = bot.entity.position.distanceTo(targetPlayer.position);
    if (dist > 3) {
      bot.setControlState('forward', true);
    } else {
      bot.setControlState('forward', false);
      clearInterval(approachInterval);
      
      // Шифтимся в знак приветствия
      let shiftCount = 0;
      const shiftInterval = setInterval(async () => {
        shiftCount++;
        bot.setControlState('sneak', true);
        await new Promise(r => setTimeout(r, 300));
        bot.setControlState('sneak', false);
        if (shiftCount >= 2) {
          clearInterval(shiftInterval);
          botState = 'wandering';
        }
      }, 600);
    }
  }, 200);
}

// Полный цикл выживания: дерево -> доски -> верстак -> палки -> топор -> стройка -> возвращение
async function autoSurvivalLoop() {
  try {
    bot.chat('Ищу дерево для ресурсов!');
    const woodBlock = bot.findBlock({
      matching: (block) => block && block.name.includes('log'),
      maxDistance: 12
    });

    if (!woodBlock) {
      bot.chat('Рядом нет дерева, продолжаю бродить.');
      botState = 'wandering';
      return;
    }

    // Идем к дереву и рубим
    await moveToPosition(woodBlock.position);
    await bot.dig(woodBlock);
    bot.chat('Добыл блок дерева!');

    botState = 'crafting';
    // Крафтим доски, палки и верстак
    const logItem = bot.inventory.items().find(i => i.name.includes('log'));
    if (logItem) {
      const plankRecipe = bot.recipesFor(bot.registry.itemsByName.oak_planks.id, null, 1, true)[0];
      if (plankRecipe) {
        await bot.craft(plankRecipe, 4, null);
        bot.chat('Скрафтил доски!');
      }

      const craftingTableRecipe = bot.recipesFor(bot.registry.itemsByName.crafting_table.id, null, 1, true)[0];
      if (craftingTableRecipe) {
        await bot.craft(craftingTableRecipe, 1, null);
        bot.chat('Скрафтил верстак!');
      }
    }

    // Возвращаемся к базе для строительства
    botState = 'returning';
    if (basePosition) {
      bot.chat('Возвращаюсь к точке базы для строительства домика!');
      await moveToPosition(basePosition);
      
      botState = 'building';
      bot.chat('Строю элементы домика на базе!');
      // Ставим блок земли или доски как фундамент дома, если он есть в инвентаре
      const blockToPlace = bot.inventory.items().find(i => i.name.includes('planks') || i.name.includes('dirt'));
      if (blockToPlace) {
        const refBlock = bot.blockAt(bot.entity.position.offset(0, -1, 0));
        if (refBlock) {
          await bot.equip(blockToPlace, 'hand');
          await bot.placeBlock(refBlock, { x: 0, y: 1, z: 0 });
          bot.chat('Поставил блок для дома!');
        }
      }
    }
  } catch (err) {
    console.log('Ошибка в цикле выживания:', err.message);
  }

  // Возвращаемся в режим блуждания
  botState = 'wandering';
}

// Вспомогательная функция движения к позиции
function moveToPosition(targetPos) {
  return new Promise((resolve) => {
    const moveInterval = setInterval(() => {
      if (!bot.entity) {
        clearInterval(moveInterval);
        resolve();
        return;
      }
      bot.lookAt(targetPos);
      const dist = bot.entity.position.distanceTo(targetPos);
      if (dist > 2) {
        bot.setControlState('forward', true);
        bot.setControlState('sprint', true);
        if (targetPos.y > bot.entity.position.y + 0.5) {
          bot.setControlState('jump', true);
        }
      } else {
        bot.setControlState('forward', false);
        bot.setControlState('sprint', false);
        bot.setControlState('jump', false);
        clearInterval(moveInterval);
        resolve();
      }
    }, 200);
  });
}

// Чат и команды
bot.on('chat', async (username, message) => {
  if (username === bot.username) return;
  const msg = message.toLowerCase().trim();

  if (msg.startsWith('!следуй') || msg.includes('иди за мной')) {
    botState = 'following';
    bot.chat(`Бегу за тобой, ${username}!`);
    return;
  }

  if (msg.startsWith('!стоп') || msg === 'стой') {
    botState = 'wandering';
    bot.clearControlStates();
    bot.chat('Стою на месте / перехожу в свободный режим!');
    return;
  }

  // ИИ-ответ
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
