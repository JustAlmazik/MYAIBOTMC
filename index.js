const mineflayer = require('mineflayer');
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is active'));
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

const bot = mineflayer.createBot({
  host: 'dynamic-9.magmanode.com',
  port: 25637,
  username: 'AIBot',
  version: '1.20.1',
  auth: 'offline'
});

let botState = 'survival_init'; // survival_init, hunting_animals, wandering
let basePosition = null;
let craftingTablePos = null;

bot.on('spawn', async () => {
  console.log('Бот вошел на мир и начинает путь выживания с нуля!');
  basePosition = bot.entity.position.clone();
  bot.chat('Всем привет! Начинаю хардкорное выживание с нуля: дерево, кирка, камень, дом и охота!');

  // Запускаем стартовый прогресс-цикл выживания
  await runSurvivalProgression();
});

// Основной фоновый цикл (поведение после завершения стартового крафта)
setInterval(async () => {
  if (!bot.entity) return;

  // 1. Автоматическая еда (если голоден и есть мясо в инвентаре)
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

  // 2. Если режим охоты на животных
  if (botState === 'hunting_animals') {
    // Высший приоритет: если рядом внезапно враг (зомби/скелет), бьем его
    const enemy = bot.nearestEntity((e) => e.type === 'mob' && ['zombie', 'skeleton', 'spider'].some(m => e.name?.includes(m) || e.mobType?.toLowerCase().includes(m)) && e.position.distanceTo(bot.entity.position) < 15);
    
    let target = enemy;
    if (!target) {
      // Ищем коров, овец, куриц, свиней в радиусе 100 блоков
      target = bot.nearestEntity((e) => 
        e.type === 'mob' && 
        ['cow', 'sheep', 'chicken', 'pig'].some(animal => e.mobType?.toLowerCase().includes(animal)) && 
        e.position.distanceTo(bot.entity.position) <= 100
      );
    }

    if (target) {
      bot.lookAt(target.position.offset(0, target.height / 2, 0));
      const dist = bot.entity.position.distanceTo(target.position);

      if (dist > 2.5) {
        bot.setControlState('forward', true);
        bot.setControlState('sprint', true);
        const frontBlock = bot.blockAt(bot.entity.position.offset(0, 0, 1));
        if ((frontBlock && frontBlock.name !== 'air') || target.position.y > bot.entity.position.y + 0.5) {
          bot.setControlState('jump', true);
        } else {
          bot.setControlState('jump', false);
        }
      } else {
        bot.setControlState('forward', false);
        bot.setControlState('sprint', false);
        bot.setControlState('jump', false);
        try { bot.attack(target); } catch (e) {}
      }
    } else {
      // Если никого нет рядом, бродим или возвращаемся к базе строить дом
      if (basePosition && bot.entity.position.distanceTo(basePosition) > 15) {
        await moveToPosition(basePosition);
        bot.chat('Вернулся к домику у верстака!');
      } else {
        if (Math.random() < 0.15) bot.look(Math.random() * Math.PI * 2, 0);
        bot.setControlState('forward', true);
        bot.setControlState('sprint', true);
      }
    }
  }
}, 500);

// --- ГЛАВНАЯ ЦЕПОЧКА ВЫЖИВАНИЯ (С НУЛЯ) ---
async function runSurvivalProgression() {
  try {
    // ШАГ 1: Ищем дерево в радиусе 100 блоков и рубим
    bot.chat('Ищу дерево в радиусе 100 блоков...');
    const woodBlock = bot.findBlock({
      matching: (block) => block && block.name.includes('log'),
      maxDistance: 100
    });

    if (!woodBlock) {
      bot.chat('Рядом нет дерева! Пробую еще раз...');
      setTimeout(() => runSurvivalProgression(), 5000);
      return;
    }

    await moveToPosition(woodBlock.position);
    await bot.dig(woodBlock);
    bot.chat('Добыл первое бревнышко!');

    // ШАГ 2: Крафтим доски
    const logItem = bot.inventory.items().find(i => i.name.includes('log'));
    if (logItem) {
      const planksRecipe = bot.recipesFor(bot.registry.itemsByName.oak_planks.id, null, 1, true)[0];
      if (planksRecipe) {
        await bot.craft(planksRecipe, 4, null);
        bot.chat('Скрафтил доски!');
      }
    }

    // ШАГ 3: Крафтим и ставим верстак
    const tableRecipe = bot.recipesFor(bot.registry.itemsByName.crafting_table.id, null, 1, true)[0];
    if (tableRecipe) {
      await bot.craft(tableRecipe, 1, null);
      bot.chat('Скрафтил верстак, ставлю его на землю!');

      const tableItem = bot.inventory.items().find(i => i.name.includes('crafting_table'));
      if (tableItem) {
        const refBlock = bot.blockAt(bot.entity.position.offset(0, -1, 0));
        await bot.equip(tableItem, 'hand');
        await bot.placeBlock(refBlock, { x: 0, y: 1, z: 0 });
        craftingTablePos = bot.entity.position.offset(0, 1, 0);
        basePosition = craftingTablePos.clone(); // База теперь там, где верстак
      }
    }

    // ШАГ 4: Крафтим палки и деревянную кирку
    const sticksRecipe = bot.recipesFor(bot.registry.itemsByName.stick.id, null, 1, true)[0];
    if (sticksRecipe) {
      await bot.craft(sticksRecipe, 4, null);
      bot.chat('Скрафтил палки!');
    }

    const tableBlock = bot.findBlock({ matching: (b) => b.name === 'crafting_table', maxDistance: 4 });
    const woodPickaxeRecipe = bot.recipesFor(bot.registry.itemsByName.wooden_pickaxe.id, null, 1, tableBlock)[0];
    if (woodPickaxeRecipe) {
      await bot.craft(woodPickaxeRecipe, 1, tableBlock);
      bot.chat('Скрафтил деревянную кирку!');
    }

    // ШАГ 5: Добываем землю и роем яму до камня
    bot.chat('Копаю землю в поисках камня...');
    let stoneBlock = null;
    while (!stoneBlock) {
      const dirtBlock = bot.blockAt(bot.entity.position.offset(0, -1, 0));
      if (dirtBlock && dirtBlock.name !== 'air' && !dirtBlock.name.includes('stone')) {
        await bot.dig(dirtBlock);
        await new Promise(r => setTimeout(r, 500));
      }
      stoneBlock = bot.findBlock({ matching: (b) => b.name.includes('stone'), maxDistance: 3 });
    }

    // ШАГ 6: Копаем 5 камня (булыжника)
    bot.chat('Нашел камень, копаю 5 штук булыжника!');
    let cobblestoneCount = 0;
    while (cobblestoneCount < 5) {
      const stone = bot.findBlock({ matching: (b) => b.name.includes('stone'), maxDistance: 4 });
      if (stone) {
        await bot.dig(stone);
        cobblestoneCount++;
        await new Promise(r => setTimeout(r, 500));
      } else {
        break;
      }
    }

    // ШАГ 7: Выбираемся наверх и крафтим каменную кирку и меч на верстаке
    bot.chat('Выбираюсь наверх и крафчу каменные инструменты!');
    await moveToPosition(basePosition);

    const activeTable = bot.findBlock({ matching: (b) => b.name === 'crafting_table', maxDistance: 5 });
    
    const stonePickaxeRecipe = bot.recipesFor(bot.registry.itemsByName.stone_pickaxe.id, null, 1, activeTable)[0];
    if (stonePickaxeRecipe) {
      await bot.craft(stonePickaxeRecipe, 1, activeTable);
      bot.chat('Скрафтил каменную кирку!');
    }

    const stoneSwordRecipe = bot.recipesFor(bot.registry.itemsByName.stone_sword.id, null, 1, activeTable)[0];
    if (stoneSwordRecipe) {
      await bot.craft(stoneSwordRecipe, 1, activeTable);
      bot.chat('Скрафтил каменный меч!');
    }

    // ШАГ 8: Переход в режим охоты на животных и строительства дома
    bot.chat('Экипировка готова! Перехожу на охоту за коровами, овцами, курицами и строительство базы!');
    botState = 'hunting_animals';

  } catch (err) {
    console.log('Ошибка в прогрессии выживания:', err.message);
    setTimeout(() => runSurvivalProgression(), 5000); // Перезапуск при сбое
  }
}

// Вспомогательная функция движения к координатам с прыжками через препятствия
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
    bot.chat(`Бегу за тобой, ${username}!`);
    return;
  }

  if (msg.startsWith('!стоп') || msg === 'стой') {
    botState = 'hunting_animals';
    bot.clearControlStates();
    bot.chat('Возвращаюсь к охоте и дому!');
    return;
  }

  if (msg.includes('землю') || msg.includes('дай землю')) {
    const dirtItem = bot.inventory.items().find(i => i.name.includes('dirt') || i.name.includes('grass'));
    if (dirtItem) {
      bot.chat('Держи землю!');
      bot.toss(dirtItem.type, null, 1, () => {});
    } else {
      bot.chat('У меня нет земли в инвентаре!');
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
