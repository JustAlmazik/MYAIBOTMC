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

let botState = 'wandering'; // wandering, approaching, cutting, hunting, following
let basePosition = null;
let isBusy = false;
let currentTarget = null;

// Список враждебных мобов, которых нужно атаковать в первую очередь
const hostileMobs = ['zombie', 'skeleton', 'spider', 'creeper', 'witch', 'enderman', 'zombified_piglin', 'husk', 'stray'];

bot.on('spawn', () => {
  console.log('Бот успешно вошел на сервер!');
  if (!basePosition) {
    basePosition = bot.entity.position.clone();
  }
  bot.chat('Всем привет! Я абсолютный хищник. Вижу врага — нет ничего важнее, иду убивать!');
});

// Если бота ударили — это враг номер один
bot.on('hurt', () => {
  if (!bot.entity) return;
  const attacker = bot.nearestEntity((e) => 
    (e.type === 'mob' || e.type === 'player') && 
    e.username !== bot.username && 
    e.position.distanceTo(bot.entity.position) < 15
  );

  if (attacker) {
    botState = 'hunting';
    currentTarget = attacker;
    isBusy = false;
    bot.chat(`Ах ты крыса! Получай по морде, ${attacker.mobType || 'враг'}!`);
  }
});

// Основной цикл поведения (с высшим приоритетом для врагов)
setInterval(async () => {
  if (!bot.entity) return;

  // 0. АВТОМАТИЧЕСКАЯ ЕДА (если голоден и есть мясо)
  if (bot.food < 18) {
    const foodItem = bot.inventory.items().find(i => 
      i.name.includes('porkchop') || 
      i.name.includes('beef') || 
      i.name.includes('mutton') || 
      i.name.includes('chicken') || 
      i.name.includes('steak')
    );
    if (foodItem) {
      try {
        await bot.equip(foodItem, 'hand');
        await bot.consume();
        bot.chat('Подкрепился мясцом!');
      } catch (err) {}
    }
  }

  // --- ВЫСШИЙ ПРИОРИТЕТ: ПОИСК ВРАГОВ В РАДИУСЕ 100 БЛОКОВ ---
  // Если бот следует за игроком по команде !следуй, можно сделать исключение, но сейчас враги важнее всего
  if (botState !== 'following') {
    const enemy = bot.nearestEntity((e) => {
      if (e.type !== 'mob') return false;
      // Проверяем, есть ли моб в списке враждебных или это кто-то, кто рядом
      const isHostile = hostileMobs.some(m => e.name && e.name.toLowerCase().includes(m)) || 
                        (e.mobType && hostileMobs.some(m => e.mobType.toLowerCase().includes(m)));
      return isHostile && e.position.distanceTo(bot.entity.position) <= 100;
    });

    if (enemy) {
      botState = 'hunting';
      currentTarget = enemy;
      isBusy = false; // Прерываем любые другие задачи (рубку дерева и т.д.)
    }
  }

  // Если находимся в режиме охоты и есть актуальная цель
  if (botState === 'hunting' && currentTarget) {
    if (!currentTarget.isValid || currentTarget.position.distanceTo(bot.entity.position) > 120) {
      botState = 'wandering';
      currentTarget = null;
      return;
    }

    bot.lookAt(currentTarget.position.offset(0, currentTarget.height / 2, 0));
    const dist = bot.entity.position.distanceTo(currentTarget.position);

    if (dist > 3) {
      bot.setControlState('forward', true);
      bot.setControlState('sprint', true);
      const frontBlock = bot.blockAt(bot.entity.position.offset(0, 0, 1));
      if ((frontBlock && frontBlock.name !== 'air') || currentTarget.position.y > bot.entity.position.y + 0.5) {
        bot.setControlState('jump', true);
      } else {
        bot.setControlState('jump', false);
      }
    } else {
      // Ближний бой вплотную без кружения
      bot.setControlState('forward', false);
      bot.setControlState('sprint', false);
      bot.setControlState('jump', false);
      
      try {
        bot.attack(currentTarget);
      } catch (e) {}
    }
    return;
  }

  // Если заняты другими делами (рубим дерево и т.д.) — пропускаем свободный ход
  if (isBusy) return;

  // Свободное блуждание, если врагов нет
  if (botState === 'wandering') {
    if (Math.random() < 0.2) {
      bot.look(Math.random() * Math.PI * 2, 0);
    }
    
    bot.setControlState('forward', true);
    bot.setControlState('sprint', true);

    const blockInFront = bot.blockAt(bot.entity.position.offset(0, 0, 1));
    if (blockInFront && blockInFront.name !== 'air') {
      bot.setControlState('jump', true);
    } else {
      bot.setControlState('jump', false);
    }

    // Проверяем игроков для приветствия (только если нет врагов)
    const playerEntries = Object.values(bot.players).filter(p => p.username !== bot.username && p.entity);
    if (playerEntries.length > 0 && Math.random() < 0.15) {
      const targetPlayer = playerEntries[0].entity;
      if (bot.entity.position.distanceTo(targetPlayer.position) < 15) {
        botState = 'approaching';
        handleApproachPlayer(targetPlayer);
        return;
      }
    }

    // Если всё тихо, можно поискать дерево
    if (Math.random() < 0.1) {
      isBusy = true;
      bot.setControlState('forward', false);
      bot.setControlState('sprint', false);
      bot.setControlState('jump', false);
      await autoSurvivalLoop();
      isBusy = false;
    }
  }
}, 500);

function handleApproachPlayer(targetPlayer) {
  isBusy = true;
  const approachInterval = setInterval(() => {
    // Если появился враг, сразу прерываем подход к игроку!
    if (botState === 'hunting' || !targetPlayer || !bot.entity || botState !== 'approaching') {
      clearInterval(approachInterval);
      if (botState !== 'hunting') botState = 'wandering';
      isBusy = false;
      return;
    }
    bot.lookAt(targetPlayer.position.offset(0, targetPlayer.height, 0));
    const dist = bot.entity.position.distanceTo(targetPlayer.position);
    if (dist > 3) {
      bot.setControlState('forward', true);
    } else {
      bot.setControlState('forward', false);
      clearInterval(approachInterval);
      botState = 'wandering';
      isBusy = false;
    }
  }, 200);
}

async function autoSurvivalLoop() {
  try {
    const woodBlock = bot.findBlock({
      matching: (block) => block && block.name.includes('log'),
      maxDistance: 15
    });

    if (!woodBlock) return;

    bot.chat('Ищу дерево и иду рубить!');
    await moveToPosition(woodBlock.position);
    await bot.dig(woodBlock);
    bot.chat('Добыл бревнышко!');

    if (basePosition) {
      await moveToPosition(basePosition);
    }
  } catch (err) {
    console.log('Ошибка в цикле выживания:', err.message);
  }
  botState = 'wandering';
}

function moveToPosition(targetPos) {
  return new Promise((resolve) => {
    const moveInterval = setInterval(() => {
      // Если появился враг во время рубки дерева — бросаем дерево нафиг и бежим убивать!
      if (botState === 'hunting' || !bot.entity) {
        clearInterval(moveInterval);
        resolve();
        return;
      }
      bot.lookAt(targetPos);
      const dist = bot.entity.position.distanceTo(targetPos);
      if (dist > 2) {
        bot.setControlState('forward', true);
        bot.setControlState('sprint', true);
        
        const frontBlock = bot.blockAt(bot.entity.position.offset(0, 0, 1));
        if ((frontBlock && frontBlock.name !== 'air') || targetPos.y > bot.entity.position.y + 0.5) {
          bot.setControlState('jump', true);
        } else {
          bot.setControlState('jump', false);
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

// Обработка чата и команд
bot.on('chat', async (username, message) => {
  if (username === bot.username) return;
  const msg = message.toLowerCase().trim();

  if (msg.startsWith('!следуй') || msg.includes('иди за мной')) {
    botState = 'following';
    currentTarget = null;
    isBusy = false;
    bot.chat(`Бегу за тобой, ${username}!`);
    return;
  }

  if (msg.startsWith('!стоп') || msg === 'стой') {
    botState = 'wandering';
    currentTarget = null;
    isBusy = false;
    bot.clearControlStates();
    bot.chat('Стою на месте!');
    return;
  }

  if (msg.includes('землю') || msg.includes('дай землю')) {
    const dirtItem = bot.inventory.items().find(i => i.name.includes('dirt') || i.name.includes('grass'));
    if (dirtItem) {
      bot.chat('Держи землю, всё по честноку!');
      bot.toss(dirtItem.type, null, 1, () => {});
    } else {
      bot.chat('У меня нет земли в инвентаре, бро!');
    }
    return;
  }

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
