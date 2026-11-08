import {
  ALLIGATOR_JAW_HEIGHT, ALLIGATOR_JAW_WIDTH, alligatorJaw, countExposedDucks,
  BURN_LIMIT, DUCK_HEIGHT, DUCK_WIDTH, HEIGHT, WIDTH, HAND_HEIGHT, HAND_WIDTH, HAND_SCALE, MAX_STAMINA
} from './arena.mjs';

const duckPixels = [
  '.....nnnnn......',
  '....ntttttnn.nn.',
  '...ntttttttonon.',
  '...ntttttktonoon',
  '...ntttttttonon.',
  '...nsttttttton..',
  '....nssssttnn...',
  '.....nnnnnnnn...',
  '..........nttnn.',
  'nn......nntttttn',
  'ntnnnnnntttttttn',
  'ntttttnnnnnttttn',
  'ntttnnsssttntssn',
  '.nssnnnnnnnsssn.',
  '..nssssssssnnn..',
  '...nnnnnnnn.....',
];

const handPixels = [
  '........nn.........',
  '.....nnnpnnn.......',
  '....nppnppnpn......',
  '....npnnppnpnnn....',
  '....npnnppnpnppn...',
  '....npnnppnpnppn...',
  '.nn.npppppppnpnn...',
  'nppnnpppppppppn....',
  'npppnsppppppppn....',
  '.nppppppppppppn....',
  '..npppppppppppn....',
  '...npppssspppn.....',
  '...nspppppppsn.....',
  '....nspppppsn......',
  '....nsssssssn......',
  '.....nnnnnnn.......',
];

const flameFrames = [
  [
    '.....r...', '....ro...', '....roo..', '.r..roor.', '.or.roor.',
    '.rorooyor', 'rooooyyor', 'rooyyyyor', '.rooyyor.', '..rrrrr..',
  ],
  [
    '..r......', '..or.....', '..ro.r...', '.rro.ro..', '.roooror.',
    'roooyooor', 'rooyyyoor', 'rooyyoyor', '.rooyyor.', '..rrrrr..',
  ],
];

const enemyArt = {
  fox: {
    colors: { n: '#503039', o: '#dd7e46', s: '#a04f3d', c: '#f5d6a0', k: '#242331' },
    rows: [
      '...............n..n.....',
      '...............nonon....',
      '...............nooon....',
      '..nnn.........nooooon...',
      '.nccnn.......noookooonn.',
      'nccooonn..nnnooooccccckn',
      'ncoooooonnnooooooccccnn.',
      '.noooossoooooooooocnn...',
      '..nnsssooooooooooon.....',
      '....nnnoosssssoson......',
      '.......nssnnnnsn........',
      '.......nsn....nsn.......',
      '.......nkn.....nkn......',
      '.......nn......nn.......',
    ],
  },
  raccoon: {
    colors: { n: '#37333f', g: '#a4a4a0', s: '#676979', c: '#ded4bc', k: '#292735' },
    rows: [
      '..............nn.nn....',
      '.............ngsngsn...',
      '.............ngggggn...',
      '.nnnn......nngccccggn..',
      'ngssgnn..nnggcnknkngnn.',
      'ngssggsnnngggnknkngcckn',
      '.nggssgsggggggcnggcnnn.',
      '..nnggssgggggggggcn....',
      '....nnnnggssssgggn.....',
      '........nnsnnnnsn......',
      '.........nkn...nkn.....',
      '.........nn.....nn.....',
    ],
  },
  blueJay: {
    colors: { n: '#253453', b: '#4d80c1', l: '#8cc9db', c: '#eef0de', k: '#263347' },
    rows: [
      '...............n.......',
      '.............nnbn......',
      '.nn.........nnbbbn.....',
      '.nlnnn.....nbbbblnnn...',
      '..nllbnn..nbbbbkcbkn...',
      '...nllbbnnbbbbbcccn....',
      '....nllbbbbbbbbccn.....',
      '.....nnbblbblbccn......',
      '....nllbbblblcnn.......',
      '..nnlbblnbncnn.........',
      '.nblbbnn.nnn...........',
      'nnnlnn.................',
      '..nn...................',
    ],
  },
  goose: {
    colors: { n: '#37414f', c: '#f5edda', s: '#c7c6b4', b: '#e8a365', k: '#282a36' },
    rows: [
      '..............nnn......',
      '.............ncccnn....',
      '.............nckccbbn..',
      '.............ncccbnn...',
      '..............nccn.....',
      '..............nccn.....',
      '..............nccn.....',
      '..............nccn.....',
      '.............nccsn.....',
      '............ncccsn.....',
      '.nnnn.....nnccccsn.....',
      'nccccnnnnnccccccsn.....',
      '.ncccccccccccccccn.....',
      '..nccccnncccccccn......',
      '...nccnssnnccccn.......',
      '....nssssssscnn........',
      '.....nnnnnnnn..........',
      '........nbn.nbn........',
      '........nbnnnbn........',
      '........nn..nn.........',
    ],
  },
};

function pixelSprite(rows, palette) {
  const sprite = document.createElement('canvas');
  sprite.width = Math.max(...rows.map((row) => row.length));
  sprite.height = rows.length;
  const context = sprite.getContext('2d');

  rows.forEach((row, y) => {
    [...row].forEach((pixel, x) => {
      const color = palette[pixel];
      if (!color) return;
      context.fillStyle = color;
      context.fillRect(x, y, 1, 1);
    });
  });
  return sprite;
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${src}`));
    image.src = src;
  });
}


export async function createRenderer(context) {
  const [hand, handHit, handSleep, handGrab, duck] = await Promise.all([
    loadImage('./assets/handOpen.png'),
    loadImage('./assets/handHit.png'),
    loadImage('./assets/handSleep.png'),
    loadImage('./assets/handGrab.png'),
    loadImage('./assets/duckling.png')
  ]);
  const enemySprites = Object.fromEntries(
    Object.entries(enemyArt).map(([type, { rows, colors }]) => [type, pixelSprite(rows, colors)]),
  );
  const flames = flameFrames.map((rows) => pixelSprite(rows, {
    r: '#c45344', o: '#f68b54', y: '#ffc678',
  }));
  const staminaRing = await createStaminaRing();
  const targetSprite = await loadImage('./assets/target.png');
  context.imageSmoothingEnabled = false;

  return (state, tutorialTarget, showStamina) => {
    const inRiver = state.zone === 'river';
    const burned = state.zone === 'burnedForest';
    if (inRiver) drawRiver(context, state.scroll);
    else if (burned) drawBurnedForest(context, state.scroll, flames);
    else drawForest(context, state.scroll);
    if (tutorialTarget) {
      const { x, y } = tutorialTarget;
      drawWarning(context, { x: x - 15, y: y - 13, width: 30, height: 26 }, '#ffe1a8');
    }
    for (const obstacle of state.obstacles) {
      if (obstacle.kind === 'fire') drawFire(context, obstacle, state.scroll, flames);
      else drawLog(context, obstacle, burned);
    }
    const exposedDuckCount = inRiver ? countExposedDucks(state.ducks) : 0;
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
       
      if (enemy.practice) drawPracticeTarget(context, enemy, targetSprite);
      else if (enemy.type === 'alligator') drawAlligator(context, enemy, exposedDuckCount);
      else if (enemySprites[enemy.type]) drawEnemy(context, enemy, enemySprites[enemy.type], inRiver);
    }
    const heldDucks = [];
    for (const duckling of state.ducks) {
      if (!duckling.alive) continue;
      if (state.heldDuckIds.includes(duckling.id)) {
        heldDucks.push(duckling);
        continue;
      }
      const { x, y } = duckling;
      const shadow = inRiver ? '#b1cfc5' : burned ? '#5b4a57' : '#759c7b';
      rect(context, shadow, Math.round(x - 5), Math.round(y + 7), 10, 2);
      context.drawImage(duck, Math.round(x - DUCK_WIDTH / 2), Math.round(y - DUCK_HEIGHT / 2));
      drawDuckBurn(context, duckling, state.scroll, flames);
    }
    const actionEffects = state.actionEffects?.length
      ? state.actionEffects
      : state.actionEffect ? [state.actionEffect] : [];
    for (const effect of actionEffects) drawActionEffect(context, effect);
    const handCount = state.hands?.length ?? 1;
    for (let handIndex = 0; handIndex < handCount; handIndex += 1) {
      if (state.activeHands && !state.activeHands[handIndex]) continue;
      const position = state.hands?.[handIndex] ?? state.hand;
      const heldIds = state.heldDuckIdsByHand?.[handIndex] ?? (handIndex === 0 ? state.heldDuckIds : []);
      const actionEffect = actionEffects.find((effect) => effect.handIndex === handIndex);
      let handImg = hand;
      if (state.cooldown > 0) {
        handImg = handSleep;
      } else if (heldIds.length > 0) {
        handImg = handGrab;
      } else if (actionEffect) {
        handImg = handHit;
      }
      const flipX = handIndex === 0 && state.webcamHandsActive;

      context.save();
      context.translate(position.x, position.y);
      context.scale(flipX ? -1 : 1, 1);
      context.drawImage(
        handImg,
        -HAND_WIDTH / 2 * HAND_SCALE,
        -HAND_HEIGHT / 2 * HAND_SCALE,
        HAND_WIDTH * HAND_SCALE,
        HAND_HEIGHT * HAND_SCALE,
      );
      context.restore();
    }
    for (const duckling of heldDucks) {
      const x = Math.round(duckling.x - DUCK_WIDTH / 2);
      const y = Math.round(duckling.y - DUCK_HEIGHT / 2);
      rect(context, '#f4dfb2', x + 3, y - 2, DUCK_WIDTH - 6, 2);
      context.drawImage(duck, x, y);
      drawDuckBurn(context, duckling, state.scroll, flames);
    }
    if (state.lightning) drawLightning(context, state.lightning);
    if (state.meteor) drawMeteor(context, state.meteor);
    if (showStamina) drawStaminaRing(context, state, staminaRing);
  };
}

const STAMINA_SEGMENTS = 12;

const staminaFrameSources = [
  './assets/stamina-00.png',  // empty
  './assets/stamina-01.png',
  './assets/stamina-02.png',
  './assets/stamina-03.png',
  './assets/stamina-04.png',
  './assets/stamina-05.png',
  './assets/stamina-06.png',
  './assets/stamina-07.png',
  './assets/stamina-08.png',
  './assets/stamina-09.png',
  './assets/stamina-10.png',
  './assets/stamina-11.png',
  './assets/stamina-12.png', // full
];

async function createStaminaRing() {
  const [frames, cooldown] = await Promise.all([
    Promise.all(staminaFrameSources.map(loadImage)),
    loadImage('./assets/stamina-00.png'),
  ]);

  return { radius: 8, frames, cooldown };
}

function drawStaminaRing(context, { hand, stamina, cooldown }, ring) {
  const { radius } = ring;
  const offsetX = HAND_WIDTH * HAND_SCALE * 0.38;
  const offsetY = HAND_HEIGHT * HAND_SCALE * 0.35;
  const x = Math.min(WIDTH - radius - 1, Math.round(hand.x + offsetX));
  const y = Math.min(HEIGHT - radius - 1, Math.round(hand.y + offsetY));
  const filled = Math.ceil(stamina / MAX_STAMINA * STAMINA_SEGMENTS);
  context.drawImage(cooldown > 0 ? ring.cooldown : ring.frames[filled], x - radius, y - radius);
}

function rect(context, color, x, y, width, height) {
  context.fillStyle = color;
  context.fillRect(x, y, width, height);
}

function drawPracticeTarget(context, enemy, sprite) {
  const x = Math.round(enemy.x);
  const y = Math.round(enemy.y);
  context.drawImage(sprite, x+2, y-5);

  drawEnemyHealth(context, enemy, y - 10);
}

function drawDuckBurn(context, duck, scroll, flames) {
  if (!duck.burnDamage) return;
  const x = Math.round(duck.x);
  const y = Math.round(duck.y);
  const fill = Math.ceil(12 * (1 - duck.burnDamage / BURN_LIMIT));
  rect(context, '#583d47', x - 7, y - 13, 14, 3);
  rect(context, '#ffc678', x - 6, y - 12, fill, 1);

  if (duck.burnTime > 0) {
    const frame = (Math.floor(scroll / 7) + duck.id) % flames.length;
    context.drawImage(flames[frame], x - 9, y - 6, 7, 9);
    context.drawImage(flames[1 - frame], x + 3, y + 1, 7, 8);
  } else if (duck.fireGrace > 0) {
    const rise = 7 - Math.ceil(duck.fireGrace * 12);
    rect(context, '#d6ebe2', x - 5, y - 5 - rise, 2, 2);
    rect(context, '#d6ebe2', x + 3, y - 2 - rise, 3, 1);
  }
}

function drawEnemy(context, enemy, sprite, inRiver) {
  const x = Math.round(enemy.x);
  const y = Math.round(enemy.y);
  const left = Math.round(x - sprite.width / 2);
  const top = Math.round(y - sprite.height / 2);
  if (enemy.type === 'blueJay' && enemy.phase === 'windup' && Number.isFinite(enemy.targetX) && Number.isFinite(enemy.targetY)) {
    const targetX = Math.round(enemy.targetX);
    const targetY = Math.round(enemy.targetY);
    drawWarning(context, { x: targetX - 11, y: targetY - 11, width: 22, height: 22 });
  }
  rect(context, inRiver ? '#7babb1' : '#759c7b', x - 7, y + Math.ceil(sprite.height / 2), 14, 2);
  if (enemy.facing < 0) {
    context.save();
    context.translate(left + sprite.width, top);
    context.scale(-1, 1);
    context.drawImage(sprite, 0, 0);
    context.restore();
  } else {
    context.drawImage(sprite, left, top);
  }
  drawEnemyHealth(context, enemy, top);
}

function drawWarning(context, bounds, color = '#f6d499') {
  const x = Math.round(bounds.x);
  const y = Math.round(bounds.y);
  const width = Math.round(bounds.width);
  const height = Math.round(bounds.height);
  for (let offset = 2; offset < width - 1; offset += 5) {
    rect(context, color, x + offset, y, 2, 1);
    rect(context, color, x + offset, y + height - 1, 2, 1);
  }
  for (let offset = 2; offset < height - 1; offset += 5) {
    rect(context, color, x, y + offset, 1, 2);
    rect(context, color, x + width - 1, y + offset, 1, 2);
  }
}

function drawEnemyHealth(context, { x, hp, maxHp }, top) {
  if (hp >= maxHp) return;
  const left = Math.round(x - maxHp * 3);
  for (let bar = 0; bar < maxHp; bar += 1) {
    rect(context, bar < hp ? '#f3a461' : '#493b45', left + bar * 6, top - 4, 4, 2);
  }
}

function drawAlligator(context, enemy, exposedDuckCount) {
  const x = Math.round(enemy.x - ALLIGATOR_JAW_WIDTH / 2);
  const y = Math.round(enemy.y - ALLIGATOR_JAW_HEIGHT / 2);
  const width = ALLIGATOR_JAW_WIDTH;
  const height = ALLIGATOR_JAW_HEIGHT;
  rect(context, '#85b7b7', x + 11, y + height, width + 21, 2);
  rect(context, '#4d7f86', x + 16, y + 3, width + 10, height - 3);
  rect(context, '#49737b', x + width + 7, y + 6, 18, 5);
  rect(context, '#557e72', x + width - 4, y + 2, 16, 5);
  rect(context, '#6b9280', x + width + 4, y + 3, 10, 2);
  rect(context, '#273f43', x + 2, y, width - 4, height);
  rect(context, '#273f43', x, y + 3, width, height - 6);
  rect(context, '#719369', x + 2, y + 2, width - 4, 4);
  rect(context, '#496d55', x + 2, y + height - 4, width - 4, 2);
  if (enemy.hitPause > 0) {
    rect(context, '#719369', x + 2, y + 6, width - 6, 4);
    rect(context, '#273f43', x + 2, y + 8, width - 6, 1);
  } else {
    rect(context, '#774751', x + 2, y + 6, width - 6, height - 9);
    for (let tooth = 4; tooth < width - 6; tooth += 5) {
      rect(context, '#f3e8c0', x + tooth, y + 5, 2, 2);
      rect(context, '#f3e8c0', x + tooth + 2, y + height - 5, 2, 2);
    }
    drawWarning(context, alligatorJaw(enemy, exposedDuckCount));
  }
  rect(context, '#273f43', x + width - 7, y - 2, 5, 6);
  rect(context, '#f2c879', x + width - 6, y - 1, 3, 3);
  rect(context, '#273f43', x + width - 5, y, 1, 2);
  drawEnemyHealth(context, enemy, y - 3);
}

function drawActionEffect(context, { action, x, y, radius }) {
  const color = {
    punch: '#f4dfb2', attackSlam: '#f3a461', defenseSlam: '#bde8cd',
    grab: '#f4dfb2', release: '#bde8cd',
  }[action];
  const points = action === 'punch' ? 8 : 20;
  for (let point = 0; point < points; point += 1) {
    const angle = point * 2 * Math.PI / points;
    const dotX = Math.round(x + Math.cos(angle) * radius);
    const dotY = Math.round(y + Math.sin(angle) * radius);
    rect(context, color, dotX - 1, dotY - 1, 3, 3);
  }
}

function tree(context, x, base, height, foliage, light, trunk) {
  const top = base - height;
  rect(context, trunk, x - 2, top + 9, 4, height - 9);
  rect(context, foliage, x - 3, top, 6, height * 0.58 | 0);
  rect(context, foliage, x - 7, top + 4, 14, height * 0.56 | 0);
  rect(context, foliage, x - 11, top + 9, 22, height * 0.44 | 0);
  rect(context, light, x - 8, top + 9, 6, 2);
  rect(context, light, x - 5, top + 4, 5, 2);
}

function drawForest(context, scroll) {
  rect(context, '#b4cfc0', 0, 0, WIDTH, HEIGHT);
  const skyline = Math.floor(scroll * 0.25);
  for (let i = -1; i < 14; i += 1) {
    const x = i * 26 - skyline % 26;
    const variant = ((i + Math.floor(skyline / 26)) % 5 + 5) % 5;
    tree(context, x, 68, 25 + variant * 3, '#82a99d', '#96baac', '#729a90');
  }

  rect(context, '#7da17b', 0, 57, WIDTH, 18);
  rect(context, '#99b58b', 0, 69, WIDTH, HEIGHT - 69);
  rect(context, '#93af84', 0, 102, WIDTH, 29);
  rect(context, '#8ea981', 0, 151, WIDTH, HEIGHT - 151);
  rect(context, '#a9bf92', 0, 81, WIDTH, 2);

  const middle = Math.floor(scroll * 0.6);
  for (let i = -1; i < 10; i += 1) {
    const x = i * 38 - middle % 38;
    const variant = ((i + Math.floor(middle / 38)) % 4 + 4) % 4;
    rect(context, '#688e70', x - 10, 73, 25, 3);
    tree(context, x, 74, 28 + variant * 4, '#5d8978', '#78a28a', '#57736a');
  }

  const ground = Math.floor(scroll);
  for (let i = 0; i < 34; i += 1) {
    const cell = i + Math.floor(ground / 10);
    const x = i * 10 - ground % 10;
    const y = 79 + (cell * 37 % 94);
    rect(context, '#809f78', x, y, 3, 1);
    rect(context, '#809f78', x + 1, y - 1, 1, 1);
    if (cell % 6 === 0) {
      rect(context, '#c7caa0', x + 4, y + 3, 3, 1);
    }
  }

  rect(context, '#688e70', 0, HEIGHT - 4, WIDTH, 4);
}

function drawRiver(context, scroll) {
  rect(context, '#9db197', 0, 0, WIDTH, HEIGHT);
  rect(context, '#a9b294', 0, 24, WIDTH, 13);
  rect(context, '#caaf84', 0, 32, WIDTH, 8);
  rect(context, '#6e9ea7', 0, 37, WIDTH, 126);
  rect(context, '#7babb1', 0, 38, WIDTH, 13);
  rect(context, '#628f9b', 0, 62, WIDTH, 56);
  rect(context, '#6896a2', 0, 118, WIDTH, 39);
  rect(context, '#86b3b4', 0, 154, WIDTH, 9);
  rect(context, '#cfb68b', 0, 163, WIDTH, 6);
  rect(context, '#879c7c', 0, 169, WIDTH, 11);

  const bank = Math.floor(scroll * 0.74);
  for (let i = -1; i < 10; i += 1) {
    const x = i * 38 - bank % 38;
    const index = i + Math.floor(bank / 38);
    tree(context, x, 32, 23 + ((index % 4 + 4) % 4) * 3, '#63887d', '#83a18d', '#577367');
    rect(context, '#5f856f', x + 12, 31, 2, 7);
    rect(context, '#79967a', x + 14, 34, 4, 2);
    rect(context, '#648775', x + 6, 168, 2, 6);
    rect(context, '#769575', x + 8, 172, 5, 2);
  }

  const current = Math.floor(scroll * 0.48);
  for (let i = 0; i < 24; i += 1) {
    const cell = i + Math.floor(current / 14);
    const x = i * 14 - current % 14;
    const y = 44 + cell * 37 % 112;
    rect(context, '#80acb2', x, y, 7 + cell % 7, 1);
    rect(context, '#759fa9', x + 4, y + 2, 5, 1);
  }
}

function drawBurnedForest(context, scroll, flames) {
  rect(context, '#986c77', 0, 0, WIDTH, HEIGHT);
  rect(context, '#bd897b', 0, 26, WIDTH, 30);
  const haze = Math.floor(scroll * 0.22);
  for (let i = -1; i < 7; i += 1) {
    const x = i * 62 - haze % 62;
    rect(context, '#8d6471', x, 29, 51, 5);
    rect(context, '#8d6471', x + 8, 24, 32, 5);
    rect(context, '#a97d84', x + 20, 18, 35, 4);
  }

  rect(context, '#77616a', 0, 54, WIDTH, 20);
  rect(context, '#85727a', 0, 70, WIDTH, HEIGHT - 70);
  rect(context, '#907b80', 0, 85, WIDTH, 24);
  rect(context, '#776670', 0, 143, WIDTH, 37);
  rect(context, '#665661', 0, 176, WIDTH, 4);

  const timber = Math.floor(scroll * 0.56);
  const flicker = Math.floor(scroll / 7);
  for (let i = -1; i < 10; i += 1) {
    const x = i * 38 - timber % 38;
    const variant = ((i + Math.floor(timber / 38)) % 5 + 5) % 5;
    const height = 22 + variant * 7;
    const top = 70 - height;
    const frame = (flicker + variant) % flames.length;
    rect(context, '#69545f', x - 7, 70, 22, 3);
    if (variant !== 4) {
      const drift = flicker % 8;
      rect(context, '#795c69', x + 2 + drift, top - 6, 19, 5);
      rect(context, '#795c69', x + 7 + drift, top - 11, 23, 5);
      rect(context, '#8a6a75', x + 13 + drift, top - 16, 22, 5);
      context.drawImage(flames[1 - frame], x - 7, top + 7, 15, 23);
    }
    rect(context, '#51404b', x, top, 4, height);
    rect(context, '#51404b', x - 4, top + 8, 4, 3);
    rect(context, '#51404b', x - 7, top + 5, 3, 3);
    rect(context, '#51404b', x + 4, top + 14, 5, 3);
    rect(context, '#51404b', x + 9, top + 11, 3, 3);
    rect(context, '#896366', x + 2, top + 2, 1, 8);
    rect(context, '#51404b', x + 3, 63, 7, 3);
    rect(context, '#51404b', x + 9, 66, 11, 3);
    if (variant !== 2) context.drawImage(flames[frame], x + 1, 51 - variant, 17, 19 + variant);
    const emberY = top + 20 - (flicker * 3 + variant * 9) % 31;
    rect(context, '#e2a16c', x + 3 + (flicker + variant) % 9, emberY, 2, 1);
  }

  const ash = Math.floor(scroll);
  for (let i = 0; i < 35; i += 1) {
    const cell = i + Math.floor(ash / 10);
    const x = i * 10 - ash % 10;
    const y = 77 + cell * 31 % 96;
    rect(context, '#6e5d67', x, y, 4, 1);
    if (cell % 4 === 0) rect(context, '#bd806d', x + 1, y - 1, 2, 1);
    if (cell % 7 === 0) rect(context, '#584955', x, y + 5, 9, 2);
  }
}

function drawFire(context, obstacle, scroll, flames) {
  const x = Math.round(obstacle.x);
  const { y, width, height } = obstacle;
  const bottom = y + height;
  
  const frame = Math.floor(scroll / 6) % flames.length;
  rect(context, '#684651', x, bottom - 5, width, 4);
  rect(context, '#a25b50', x + 3, bottom - 7, width - 6, 3);
  for (let offset = 0; offset < width - 4; offset += 7) {
    const variation = (offset * 3 + Math.floor(scroll / 8)) % 9;
    const size = height - variation - (offset === 0 ? 9 : 1);
    const tongueWidth = Math.min(width - offset, 14);
    context.drawImage(flames[(frame + offset) % flames.length], x + offset, bottom - size, size, size);
  }
}

function drawBurst(context, color, x, y, radius) {
  const corner = Math.max(1, Math.floor(radius / 3));
  rect(context, color, x - radius, y - radius + corner, radius * 2, (radius - corner) * 2);
  rect(context, color, x - radius + corner, y - radius, (radius - corner) * 2, radius * 2);
}

function drawPixelRay(context, color, x, y, dx, dy, weight) {
  const length = Math.max(Math.abs(dx), Math.abs(dy));
  for (let step = 0; step <= length; step += 1) {
    const size = step < length * 0.55 ? weight : 1;
    rect(context, color, Math.round(x + dx * step / length), Math.round(y + dy * step / length), size, size);
  }
}

function drawMeteorHitFrame(context, x, y) {
  rect(context, '#21182bcb', 0, 0, WIDTH, HEIGHT);
  const rays = [
    [-24, -12, -113, -49], [19, -16, 79, -62], [-33, 4, -133, 19],
    [34, 3, 114, 29], [-18, 19, -67, 56], [15, 17, 51, 58],
    [-6, -23, -20, -61], [6, 21, 18, 55],
  ];
  for (const [startX, startY, dx, dy] of rays) {
    drawPixelRay(context, '#a34f51', x + startX, y + startY + 3, dx, dy, 4);
    drawPixelRay(context, '#f79c61', x + startX, y + startY, dx, dy, 2);
  }
  for (let shard = 0; shard < 18; shard += 1) {
    const angle = shard * 2 * Math.PI / 18;
    const radius = 31 + shard % 4 * 12;
    const px = Math.round(x + Math.cos(angle) * radius);
    const py = Math.round(y + Math.sin(angle) * radius * 0.62);
    rect(context, shard % 2 ? '#f6a064' : '#f9d29a', px, py, 2 + shard % 3, 2);
  }
  drawBurst(context, '#502a42', x, y, 30);
  drawBurst(context, '#e96e55', x, y, 23);
  drawBurst(context, '#ffbd76', x, y, 16);
  drawPixelRay(context, '#ffd88c', x - 59, y, 118, 0, 3);
  drawPixelRay(context, '#ffd88c', x, y - 35, 0, 66, 2);
  drawBurst(context, '#fff5d3', x, y, 9);
}

function drawMeteor(context, { phase, progress, x, y }) {
  if (phase === 'approach') {
    drawWarning(context, { x: x - 17, y: y - 14, width: 34, height: 28 }, '#ffc284');
    const fall = progress * progress;
    const centerX = Math.round(x + 124 * (1 - fall));
    const centerY = Math.round(y - 114 * (1 - fall));
    for (let tail = 6; tail >= 1; tail -= 1) {
      const size = 15 - tail * 2;
      rect(context, tail > 3 ? '#c56451' : '#f28b56', centerX + tail * 5, centerY - tail * 4, size, size);
    }
    rect(context, '#6f4651', centerX - 6, centerY - 5, 13, 11);
    rect(context, '#e87b54', centerX - 4, centerY - 6, 9, 12);
    rect(context, '#ffd08a', centerX - 4, centerY - 3, 7, 7);
    rect(context, '#fff0be', centerX - 2, centerY - 2, 4, 4);
    return;
  }

  if (progress < 0.31) {
    drawMeteorHitFrame(context, x, y);
    return;
  }

  const radius = Math.round(9 + progress * 48);
  context.save();
  context.globalAlpha = 1 - progress * 0.64;
  for (let index = 0; index < 24; index += 1) {
    const angle = index * Math.PI / 12;
    const sparkX = Math.round(x + Math.cos(angle) * radius);
    const sparkY = Math.round(y + Math.sin(angle) * radius * 0.7);
    rect(context, index % 2 ? '#ee8753' : '#ffcd87', sparkX - 2, sparkY - 2, 5, 5);
  }
  const core = Math.max(2, Math.round(17 - progress * 15));
  drawBurst(context, '#c65f4f', x, y, core);
  drawBurst(context, '#f8a260', x, y, Math.max(2, core - 3));
  rect(context, '#fff0be', x - 4, y - 3, 8, 6);
  context.restore();
}

function drawLightning(context, { phase, progress, x, y }) {
  x = Math.round(x);
  y = Math.round(y);
  if (phase === 'warning') {
    drawWarning(context, { x: x - 12, y: y - 8, width: 24, height: 16 }, '#eee0f3');
    return;
  }

  const segments = [18, 10, 15, 4, 7, 0];
  context.save();
  context.globalAlpha = 1 - progress * 0.64;
  for (let i = 0; i < segments.length; i += 1) {
    const top = Math.round((y + 6) * i / segments.length) - 6;
    const bottom = Math.round((y + 6) * (i + 1) / segments.length) - 6;
    const boltX = x + segments[i];
    const nextX = x + (segments[i + 1] ?? 0);
    rect(context, '#a99cc8', boltX - 2, top, 6, bottom - top + 2);
    rect(context, '#fff4db', boltX, top, 2, bottom - top + 1);
    rect(context, '#fff4db', Math.min(boltX, nextX), bottom, Math.abs(nextX - boltX) + 2, 2);
  }
  rect(context, '#eee0f3', x - 8, y - 1, 17, 3);
  rect(context, '#fff4db', x - 2, y - 4, 5, 9);
  context.restore();
}

function drawLog(context, { x, y, width, height }, burned) {
  x = Math.round(x);
  y = Math.round(y);
  width = Math.round(width);
  height = Math.round(height);
  rect(context, burned ? '#6b5862' : '#6b896d', x + 3, y + 3, width, height);
  rect(context, '#513f36', x + 2, y, width - 4, height);
  rect(context, '#513f36', x, y + 3, width, height - 6);
  rect(context, '#996b51', x + 2, y + 3, width - 4, height - 6);
  rect(context, '#bb8962', x + 3, y + 5, 3, height - 10);
  rect(context, '#744e3d', x + width - 5, y + 4, 3, height - 9);
  for (let grain = 7; grain < height - 8; grain += 11) {
    rect(context, '#744e3d', x + 8, y + grain, 1, 5);
  }
  rect(context, '#d8aa74', x + 4, y + height - 6, width - 8, 4);
  rect(context, '#aa7352', x + 7, y + height - 5, width - 14, 2);
}
