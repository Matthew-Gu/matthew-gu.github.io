class Sprite {
  constructor({
    ctx,
    position,
    image,
    frames = { max: 1, interval: 10 },
    animate = false,
    sprites,
  }) {
    this.ctx = ctx;
    this.position = position;
    this.image = image;
    this.frames = { ...frames, val: 0, elapsed: 0 };

    this.image.onload = () => {
      this.width = this.image.width / this.frames.max;
      this.height = this.image.height;
    };

    this.animate = animate;
    this.sprites = sprites;
  }

  draw() {
    this.ctx.drawImage(
      this.image,
      this.frames.val * this.width,
      0,
      this.image.width / this.frames.max,
      this.image.height,
      this.position.x,
      this.position.y,
      this.image.width / this.frames.max,
      this.image.height
    );

    if (!this.animate) return;

    if (this.frames.max > 1) {
      this.frames.elapsed++;
    }

    if (this.frames.elapsed % this.frames.interval === 0) {
      if (this.frames.val < this.frames.max - 1) this.frames.val++;
      else this.frames.val = 0;
    }
  }
}

class Boundary {
  constructor({ ctx, position, width, height, color, isShow = true }) {
    this.ctx = ctx;
    this.position = position;
    this.width = width;
    this.height = height;
    this.color = color;
    this.isShow = isShow;
  }

  draw() {
    if (!this.isShow) return;
    this.ctx.fillStyle = this.color;
    this.ctx.fillRect(
      this.position.x,
      this.position.y,
      this.width,
      this.height
    );
  }
}

export { Sprite, Boundary };
