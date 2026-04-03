import Phaser from 'phaser';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this.lastFireTime = 0;
    this.fireCooldown = 250;
    this.score = 0;
    this.registryData = null;
    this.prevSignal = '00';
    this.direction = 'NONE';
    this.jumpRequested = false;
    this.speedX = 0;
    this.maxSpeed = 180;
  }

  preload() {
    // No external assets required.
  }

  create() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.registryData = this.registry.get('sensors');

    this.physics.world.setBounds(0, 0, width * 2, height);

    this.ground = this.add.rectangle(width, height - 24, width * 2, 48, 0x334422);
    this.physics.add.existing(this.ground, true);

    this.player = this.add.rectangle(100, height - 110, 28, 28, 0x66ccff);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    this.player.body.setBounce(0.1);
    this.player.body.setGravityY(900);

    this.physics.add.collider(this.player, this.ground);

    this.fireballs = this.physics.add.group();
    this.scoreText = this.add.text(16, 16, 'Score: 0', { fontSize: '20px', fill: '#fff', fontFamily: 'monospace' }).setScrollFactor(0);

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setBounds(0, 0, width * 2, height);

    this.enemies = this.physics.add.group();
    for (let i = 0; i < 4; i++) {
      const enemy = this.add.rectangle(420 + i * 280, height - 90, 28, 28, 0xff4444);
      this.physics.add.existing(enemy);
      enemy.body.setAllowGravity(false);
      enemy.body.setVelocityX(-90);
      this.enemies.add(enemy);
    }

    this.physics.add.collider(this.player, this.enemies, () => {
      this.scene.pause();
      this.add.text(this.cameras.main.scrollX + width / 2 - 90, this.cameras.main.scrollY + height / 2 - 30, 'GAME OVER', { fontSize: '36px', fill: '#ff8888', fontFamily: 'monospace' });
      this.add.text(this.cameras.main.scrollX + width / 2 - 110, this.cameras.main.scrollY + height / 2 + 10, 'Refresh page to restart', { fontSize: '18px', fill: '#ffffff', fontFamily: 'monospace' });
    });
  }

  update(time) {
    if (!this.registryData || !this.registryData.current) return;

    const flex1 = Number(this.registryData.current.flex1 || 0);
    const flex2 = Number(this.registryData.current.flex2 || 0);
    const mic = Number(this.registryData.current.mic || 0);

    const b1 = flex1 < 500 ? 1 : 0;
    const b2 = flex2 < 500 ? 1 : 0;
    const signal = `${b1}${b2}`;

    if (signal !== this.prevSignal) {
      this.prevSignal = signal;
      if (signal === '01') {
        this.direction = 'FORWARD';
      } else if (signal === '10') {
        this.direction = 'BACK';
      } else if (signal === '00') {
        this.direction = 'NONE';
      } else if (signal === '11') {
        this.jumpRequested = true;
      }
    }

    // Inertia movement
    if (this.direction === 'FORWARD') {
      this.speedX = Math.min(this.speedX + 7, this.maxSpeed);
    } else if (this.direction === 'BACK') {
      this.speedX = Math.max(this.speedX - 7, -this.maxSpeed * 0.8);
    } else {
      this.speedX *= 0.88;
      if (Math.abs(this.speedX) < 1) this.speedX = 0;
    }

    this.player.body.setVelocityX(this.speedX);

    // Jump request
    if (this.jumpRequested && this.player.body.blocked.down) {
      this.player.body.setVelocityY(-460);
      this.jumpRequested = false;
    }

    if (mic > 500 && time - this.lastFireTime > this.fireCooldown) {
      this.shootFireball();
      this.lastFireTime = time;
    }

    this.player.fillColor = signal === '11' ? 0xffff00 : signal === '01' ? 0x66ccff : signal === '10' ? 0x6688ff : 0x66ccff;

    this.fireballs.children.iterate(fireball => {
      if (fireball && fireball.x > this.cameras.main.scrollX + window.innerWidth + 60) {
        fireball.destroy();
      }
    });

    this.enemies.children.iterate(enemy => {
      if (enemy.x < this.cameras.main.scrollX - 40) {
        enemy.x = this.cameras.main.scrollX + window.innerWidth + 80;
      }
    });

    this.score += Math.max(0.02, Math.abs(this.speedX) * 0.0008);
    this.scoreText.setText(`Score: ${Math.floor(this.score)}`);
  }

  shootFireball() {
    const fireball = this.add.rectangle(this.player.x + 24, this.player.y, 14, 8, 0xffa500);
    this.physics.add.existing(fireball);
    fireball.body.setAllowGravity(false);
    fireball.body.setVelocityX(360);
    this.fireballs.add(fireball);

    this.time.delayedCall(1600, () => fireball.destroy());
  }
}
