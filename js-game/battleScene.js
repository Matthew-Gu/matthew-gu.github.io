import { Sprite } from './classes.js';

let battleAnimationId;
let battleBackground;
let draggle;
let emby;

function initBattle(ctx) {
  const battleBackgroundImage = new Image();
  battleBackgroundImage.src = './img/battleBackground.png';
  battleBackground = new Sprite({
    ctx,
    position: {
      x: 0,
      y: 0,
    },
    image: battleBackgroundImage,
  });

  const draggleImage = new Image();
  draggleImage.src = './img/draggleSprite.png';
  draggle = new Sprite({
    ctx,
    position: {
      x: 800,
      y: 100,
    },
    image: draggleImage,
    frames: {
      max: 4,
      interval: 48,
    },
    animate: true,
  });

  const embyImage = new Image();
  embyImage.src = './img/embySprite.png';
  emby = new Sprite({
    ctx,
    position: {
      x: 280,
      y: 325,
    },
    image: embyImage,
    frames: {
      max: 4,
      interval: 48,
    },
    animate: true,
  });
}

function animateBattle() {
  battleAnimationId = requestAnimationFrame(animateBattle);
  battleBackground.draw();
  draggle.draw();
  emby.draw();
}

export { battleAnimationId, draggle, emby, initBattle, animateBattle };
