import { Sprite, Boundary } from './classes.js';
import { collisionsData, battleZonesData } from './data/map.js';
import { battleAnimationId, initBattle, animateBattle } from './battleScene.js';

const gamePanel = document.querySelector('#game-panel');
const overlappingDiv = document.querySelector('.overlappingDiv');
const optionsDiv = document.querySelector('.options');
const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');

canvas.width = 1024;
canvas.height = 576;
canvas.style.width = '100%';

optionsDiv.style.visibility = 'hidden';

let showCollisions = false;

let animationId;
const tiledWidth = 70;

const collisionsMap = [];
for (let i = 0; i < collisionsData.length; i += tiledWidth) {
  collisionsMap.push(collisionsData.slice(i, i + tiledWidth));
}

const battleZonesMap = [];
for (let i = 0; i < battleZonesData.length; i += tiledWidth) {
  battleZonesMap.push(battleZonesData.slice(i, i + tiledWidth));
}

const boundaries = [];
const offset = {
  x: -735,
  y: -620,
};

collisionsMap.forEach((row, i) => {
  row.forEach((symbol, j) => {
    if (symbol === 1025) {
      const boundary = new Boundary({
        ctx,
        width: 48,
        height: 48,
        color: 'rgba(255, 0, 0, .3)',
        isShow: showCollisions,
      });
      boundary.position = {
        x: j * boundary.width + offset.x,
        y: i * boundary.height + offset.y,
      };
      boundaries.push(boundary);
    }
  });
});

const battleZones = [];

battleZonesMap.forEach((row, i) => {
  row.forEach((symbol, j) => {
    if (symbol === 1025) {
      const battleZone = new Boundary({
        ctx,
        width: 48,
        height: 48,
        color: 'rgba(0, 255, 255, .3)',
        isShow: showCollisions,
      });
      battleZone.position = {
        x: j * battleZone.width + offset.x,
        y: i * battleZone.height + offset.y,
      };
      battleZones.push(battleZone);
    }
  });
});

ctx.fillStyle = 'white';
ctx.fillRect(0, 0, canvas.width, canvas.height);

const townImage = new Image();
townImage.src = './img/Pellet Town.png';

const foregroundImage = new Image();
foregroundImage.src = './img/foregroundObjects.png';

const playerUpImage = new Image();
playerUpImage.src = './img/playerUp.png';

const playerDownImage = new Image();
playerDownImage.src = './img/playerDown.png';

const playerLeftImage = new Image();
playerLeftImage.src = './img/playerLeft.png';

const playerRightImage = new Image();
playerRightImage.src = './img/playerRight.png';

const background = new Sprite({
  ctx,
  position: {
    x: offset.x,
    y: offset.y,
  },
  image: townImage,
});

const foreground = new Sprite({
  ctx,
  position: {
    x: offset.x,
    y: offset.y,
  },
  image: foregroundImage,
});

const player = new Sprite({
  ctx,
  position: {
    x: canvas.width / 2 - playerDownImage.width / 4 / 2,
    y: canvas.height / 2 - playerDownImage.height / 2,
  },
  frames: {
    max: 4,
    interval: 16,
  },
  image: playerDownImage,
  sprites: {
    up: playerUpImage,
    left: playerLeftImage,
    down: playerDownImage,
    right: playerRightImage,
  },
});

const keys = {
  w: {
    pressed: false,
    axis: 'y',
    delta: 3,
    sprite: player.sprites.up,
  },
  a: {
    pressed: false,
    axis: 'x',
    delta: 3,
    sprite: player.sprites.left,
  },
  s: {
    pressed: false,
    axis: 'y',
    delta: -3,
    sprite: player.sprites.down,
  },
  d: {
    pressed: false,
    axis: 'x',
    delta: -3,
    sprite: player.sprites.right,
  },
};

const movables = [background, foreground, ...boundaries, ...battleZones];

function collisionDetection({ rectangle1, rectangle2 }) {
  return (
    rectangle1.position.x + rectangle1.width >= rectangle2.position.x &&
    rectangle1.position.x <= rectangle2.position.x + rectangle2.width &&
    rectangle1.position.y <= rectangle2.position.y + rectangle2.height &&
    rectangle1.position.y + rectangle1.height >= rectangle2.position.y
  );
}

const battle = {
  initiated: false,
};

function movePlayer(direction) {
  if (battle.initiated) return;
  // 战斗检测
  for (let i = 0; i < battleZones.length; i++) {
    const battleZone = battleZones[i];
    // 玩家与战斗区域重叠宽度
    const overlappingWidth =
      Math.min(player.position.x + player.width, battleZone.position.x + battleZone.width) -
      Math.max(player.position.x, battleZone.position.x);
    // 玩家与战斗区域重叠高度
    const overlappingHeight =
      Math.min(player.position.y + player.height, battleZone.position.y + battleZone.height) -
      Math.max(player.position.y, battleZone.position.y);
    // 玩家与战斗区域重叠面积
    const overlappingArea = overlappingWidth * overlappingHeight;
    // 玩家与战斗区域重叠面积大于玩家面积的一半，则10%的概率发生战斗
    if (
      collisionDetection({
        rectangle1: player,
        rectangle2: battleZone,
      }) &&
      overlappingArea > (player.width * player.height) / 2 &&
      Math.random() < 0.1
    ) {
      cancelAnimationFrame(animationId);
      battle.initiated = true;
      const flicker = [{ opacity: 0 }, { opacity: 1 }];
      const timing = {
        duration: 400,
        iterations: 3,
        fill: 'forwards',
      };

      const animate = overlappingDiv.animate(flicker, timing);
      animate.onfinish = () => {
        initBattle(ctx);
        animateBattle();
        overlappingDiv.animate([{ opacity: 0 }], {
          duration: 400,
          fill: 'forwards',
        });
        optionsDiv.style.visibility = 'visible';
      };
      break;
    }
  }

  let moving = true;
  player.animate = true;
  player.image = direction.sprite;

  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    const newBoundaryPos = {
      ...boundary.position,
      [direction.axis]: boundary.position[direction.axis] + direction.delta,
    };
    if (
      collisionDetection({
        rectangle1: player,
        rectangle2: {
          ...boundary,
          position: newBoundaryPos,
        },
      })
    ) {
      moving = false;
      break;
    }
  }

  if (moving) {
    movables.forEach((movable) => {
      movable.position[direction.axis] += direction.delta;
    });
  }
}

function animate() {
  animationId = requestAnimationFrame(animate);
  background.draw();
  boundaries.forEach((boundary) => {
    boundary.draw();
  });

  battleZones.forEach((battleZone) => {
    battleZone.draw();
  });

  player.draw();
  player.animate = false;

  foreground.draw();

  if (keys.w.pressed && lastKey === 'w') {
    movePlayer(keys.w);
  } else if (keys.s.pressed && lastKey === 's') {
    movePlayer(keys.s);
  } else if (keys.a.pressed && lastKey === 'a') {
    movePlayer(keys.a);
  } else if (keys.d.pressed && lastKey === 'd') {
    movePlayer(keys.d);
  }
}

animate();

const escapeBtn = document.querySelector('.escape');

function escape() {
  cancelAnimationFrame(battleAnimationId);
  overlappingDiv.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: 400,
    fill: 'forwards',
  }).onfinish = () => {
    overlappingDiv.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 400,
      fill: 'forwards',
    });
    battle.initiated = false;
    optionsDiv.style.visibility = 'hidden';
    animationId = requestAnimationFrame(animate);
  };
}

escapeBtn.onclick = escape;

let lastKey = '';
window.addEventListener('keydown', (event) => {
  switch (event.key) {
    case 'w':
      keys.w.pressed = true;
      lastKey = 'w';
      break;
    case 's':
      keys.s.pressed = true;
      lastKey = 's';
      break;
    case 'a':
      keys.a.pressed = true;
      lastKey = 'a';
      break;
    case 'd':
      keys.d.pressed = true;
      lastKey = 'd';
      break;
  }
});

window.addEventListener('keyup', (e) => {
  switch (e.key) {
    case 'w':
      keys.w.pressed = false;
      break;
    case 'a':
      keys.a.pressed = false;
      break;
    case 's':
      keys.s.pressed = false;
      break;
    case 'd':
      keys.d.pressed = false;
      break;
  }

  // 检查是否有其他键仍然被按下，如果有则更新 lastKey
  if (keys.w.pressed) {
    lastKey = 'w';
  } else if (keys.a.pressed) {
    lastKey = 'a';
  } else if (keys.s.pressed) {
    lastKey = 's';
  } else if (keys.d.pressed) {
    lastKey = 'd';
  } else {
    lastKey = ''; // 如果没有键按下，清空 lastKey
  }
});

// 获取缩放比例
const getScale = (w = 1024, h = 576) => {
  const scale = Math.min(window.innerWidth / w, window.innerHeight / h);
  return scale;
};

// 缩放样式
const setScaleStyle = (element) => {
  const scale = getScale(element.clientWidth, element.clientHeight);
  element.style.transform = `scale(${scale}) translate(-50%, -50%)`;
  element.style.transformOrigin = '0 0';
};

if (gamePanel) {
  setScaleStyle(gamePanel);
  window.onresize = () => {
    setScaleStyle(gamePanel);
  };
}
