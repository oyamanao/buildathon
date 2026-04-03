/**
 * GameEngine.js — Pure Canvas game engine for Echo-Blade
 * Handles sprite rendering, physics, inertia movement, tilemap, parallax, camera.
 */

// ─── Sprite Atlas Loader ──────────────────────────────
import { audioManager } from './AudioManager';

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn(`Fallback image loading failed: ${src}`);
      // return a blank canvas to prevent crash
      const canvas = document.createElement('canvas');
      canvas.width = 1; canvas.height = 1;
      resolve(canvas);
    };
    img.src = src;
  });
}

async function loadJSON(src) {
  const res = await fetch(src);
  return res.json();
}

// ─── Constants ────────────────────────────────────────
const GRAVITY = 0.4;
const MAX_FALL_SPEED = 8;
const GROUND_ACCEL = 0.35;
const GROUND_FRICTION = 0.88;
const AIR_ACCEL = 0.30;
const AIR_FRICTION = 0.96;
const MAX_SPEED = 4.5;
const JUMP_FORCE = -14;
const TILE_SIZE = 16;
const SCALE = 3;
const PLAYER_SCALE = 2.5;

// ─── Game Engine Class ────────────────────────────────
export class GameEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    // Assets
    this.atlasImg = null;
    this.atlasData = null;
    this.tilesetImg = null;
    this.backImg = null;
    this.middleImg = null;
    this.mapData = null;
    this.dinoImg = null;
    this.heroAttackImg = null;
    
    this.heroSprites = { idle: null, run: null, jump: null, attack: null };

    // Player state
    this.player = {
      x: 120,
      y: 200,
      vx: 0,
      vy: 0,
      grounded: false,
      facingRight: true,
      width: 20,
      height: 26,
    };

    // Companion state (Dino)
    this.companion = {
      x: 100,
      y: 200,
      vx: 0,
      vy: 0,
      facingRight: true,
      frame: 0,
      animTimer: 0
    };

    // Projectiles
    this.projectiles = []; // { x, y, vx, vy, life }

    // ─── TWO-CHANNEL INPUT ────────────────────────────
    // Jump and horizontal are SEPARATE so they can be active simultaneously.
    // Keyboard: Space + ArrowRight = jump AND move right at the same time.
    // Glove: JUMP (11) inherits previous horizontal; switch to FORWARD (01) mid-air.
    this.input = {
      jump: false,        
      horizontal: 'none', 
      mode: 'MOVE'        // Voice command mode: 'MOVE' or 'ATTACK'
    };
    this.jumpConsumed = false;
    this.lastHorizontal = 'none'; // remembered direction for glove inertia

    // Camera
    this.camera = { x: 0, y: 0 };

    // Animation
    this.animState = 'idle';
    this.animFrame = 0;
    this.animTimer = 0;
    this.animSpeed = 120; // ms per frame

    // Sprite frame cache
    this.spriteFrames = {};

    // Game state
    this.score = 0;
    this.running = false;
    this.rafId = null;
    this.lastTime = 0;

    // Map collision data
    this.collisionTiles = [];
    this.mapWidth = 0;
    this.mapHeight = 0;
  }

  async load() {
    try {
      // Preload Audio
      await audioManager.load({
        'bgm': '/assets/audio/Chill RPG theme (RPG).wav',
        'jump': '/assets/audio/Leap (Gj3).wav',
        'attack': '/assets/audio/Sword Slash (Rpg).wav',
        'spell': '/assets/audio/Dagger Basic Attack Combo.wav',
        'step': '/assets/audio/Footsteps Loop 1 (Rpg).wav'
      });

      const [tilesetImg, backImg, middleImg, mapData, dinoImg, 
             heroIdle, heroRun, heroJump, heroAttack] = await Promise.all([
        loadImage('/assets/environment/gothic/tileset.png'),
        loadImage('/assets/environment/gothic/background.png'),
        loadImage('/assets/environment/gothic/graveyard.png'),
        loadJSON('/assets/maps/map.json'),
        loadImage('/assets/sprites/dino-red.png'),
        loadImage('/assets/sprites/hero-idle.png'),
        loadImage('/assets/sprites/hero-run.png'),
        loadImage('/assets/sprites/hero-jump.png'),
        loadImage('/assets/sprites/hero-attack.png'),
      ]);

      this.tilesetImg = tilesetImg;
      this.backImg = backImg;
      this.middleImg = middleImg;
      this.mapData = mapData;
      this.dinoImg = dinoImg;
      
      // Store hero sprites in an object for easy access
      this.heroSprites = {
        idle: heroIdle,
        run: heroRun,
        jump: heroJump,
        attack: heroAttack
      };

      // Generate a perfectly flat tutorial plane spanning 100 columns.
      this.mapWidth = 100;
      this.mapHeight = 25;
      this.collisionTiles = new Array(this.mapWidth * this.mapHeight).fill(0);
      
      // Fill bottom rows with solid tiles
      for (let c = 0; c < this.mapWidth; c++) {
        for (let r = 18; r < this.mapHeight; r++) {
          this.collisionTiles[r * this.mapWidth + c] = 79; // A standard solid gothicvania tile
        }
      }

      // Find a good starting position (first solid ground tile, put player above it)
      this.findStartPosition();

      return true;
    } catch (err) {
      console.error('Failed to load game assets:', err);
      return false;
    }
  }

  findStartPosition() {
    // Look through the first few columns to find the topmost solid ground
    for (let col = 2; col < 8; col++) {
      for (let row = 0; row < this.mapHeight; row++) {
        const tileId = this.collisionTiles[row * this.mapWidth + col];
        if (tileId > 0 && tileId < 2000000000) {
          this.player.x = col * TILE_SIZE * SCALE + TILE_SIZE;
          this.player.y = (row - 2) * TILE_SIZE * SCALE;
          return;
        }
      }
    }
    // Fallback
    this.player.x = 120;
    this.player.y = 200;
  }

  /**
   * Set input from two separate channels + voice mode.
   * @param {boolean} jump - is jump active?
   * @param {'left'|'right'|'none'} horizontal - horizontal direction
   * @param {'MOVE'|'SWORD'|'SPELL'} mode - current voice command mode
   */
  setInput(jump, horizontal, mode = 'MOVE') {
    this.input.mode = mode;

    if (mode === 'SWORD' || mode === 'SPELL') {
      // In combat modes, gestures trigger attacks.
      const gestureTriggered = (jump && !this.input.jump) || 
                               (horizontal !== 'none' && horizontal !== this.input.horizontal);
      
      let casted = false;
      if (gestureTriggered) {
        if (mode === 'SPELL') {
          casted = this.castSpell(jump, horizontal);
        } else if (mode === 'SWORD') {
          casted = this.swordAttack();
        }
      }
      
      // We still map jump and horizontal normally so the player NEVER feels stuck!
      if (jump && !this.input.jump) {
        this.jumpConsumed = false;
      }
      this.input.jump = jump;
      this.input.horizontal = horizontal;

      if (horizontal !== 'none') {
        this.lastHorizontal = horizontal;
      }
      
      return casted;
    }

    // --- Normal MOVE mode ---
    // Reset jump consumed when jump newly pressed
    if (jump && !this.input.jump) {
      this.jumpConsumed = false;
    }
    this.input.jump = jump;
    this.input.horizontal = horizontal;

    // Track last non-none horizontal for glove inertia
    if (horizontal !== 'none') {
      this.lastHorizontal = horizontal;
    }

    return false;
  }

  setMode(mode) {
    this.input.mode = mode;
  }

  castSpell(jump, horizontal) {
    // Only cast if we have a valid spell gesture
    if (!jump && horizontal === 'none') return false;
    
    // Simple cooldown
    if (performance.now() - (this.lastSpellTime || 0) < 500) return false;
    this.lastSpellTime = performance.now();
    audioManager.playSound('spell', 0.6);

    // Spawn fireball from Companion
    // Companion is this.companion
    let vx = 0;
    let vy = 0;
    const speed = 6;

    if (jump) {
      vy = -speed;
    } else if (horizontal === 'right') {
      vx = speed;
    } else if (horizontal === 'left') {
      vx = -speed;
    }

    const size = 10;
    this.projectiles.push({
      x: this.companion.x,
      y: this.companion.y - 10,
      vx,
      vy,
      width: size,
      height: size,
      life: 60 // frames
    });

    // Optional: set player animation to attack here
    this.animState = 'attack';
    this.animTimer = performance.now();
    return true;
  }

  swordAttack() {
    // Simple cooldown for sword swings
    if (performance.now() - (this.lastSwordTime || 0) < 400) return false;
    this.lastSwordTime = performance.now();
    audioManager.playSound('attack', 0.5);

    // Trigger hero-attack.png animation
    this.animState = 'attack';
    this.animTimer = performance.now();
    this.animFrame = 0; // force start from frame 0

    // TODO: Spawn a melee hitbox in front of the player
    // to damage enemies when they are implemented.
    // For now, it just triggers the visual slash.

    return true;
  }

  // Legacy compat — still used for display gesture name
  getGestureName() {
    if (this.input.mode === 'SWORD') return 'SWORD MODE';
    if (this.input.mode === 'SPELL') return 'SPELL MODE';
    if (this.input.jump && this.input.horizontal !== 'none') return 'JUMP+MOVE';
    if (this.input.jump) return 'JUMP';
    if (this.input.horizontal === 'right') return 'FORWARD';
    if (this.input.horizontal === 'left') return 'BACK';
    return 'IDLE';
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  loop(timestamp) {
    if (!this.running) return;

    const dt = Math.min(timestamp - this.lastTime, 33); // Cap at ~30fps delta
    this.lastTime = timestamp;

    this.update(dt);
    this.render();

    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  // ─── Update ───────────────────────────────────────
  update(dt) {
    const p = this.player;
    const onGround = p.grounded;

    // ═══════════════════════════════════════════════════
    // TWO-CHANNEL INERTIA MOVEMENT
    //
    // Jump and horizontal direction are independent:
    //   Keyboard: Space+ArrowRight = jump AND move right simultaneously
    //   Glove:    FORWARD(01)→JUMP(11) = jump with inherited direction
    //             JUMP(11)→FORWARD(01) = start moving mid-air!
    //
    // horizontal='right' → accelerate right
    // horizontal='left'  → accelerate left
    // horizontal='none'  → friction (slow down)
    // jump=true           → vertical impulse (independent of horizontal)
    // ═══════════════════════════════════════════════════

    // Step 1: Resolve effective horizontal direction
    let hDir = this.input.horizontal;

    // For glove inertia: if jump is active and no horizontal input,
    // inherit the last direction so momentum carries through
    if (this.input.jump && hDir === 'none' && this.lastHorizontal !== 'none') {
      hDir = this.lastHorizontal;
    }

    // Step 2: Apply horizontal movement
    const accel = onGround ? GROUND_ACCEL : AIR_ACCEL;

    if (hDir === 'right') {
      p.vx = Math.min(p.vx + accel, MAX_SPEED);
      p.facingRight = true;
    } else if (hDir === 'left') {
      p.vx = Math.max(p.vx - accel, -MAX_SPEED);
      p.facingRight = false;
    } else {
      // No direction: friction slows down
      const friction = onGround ? GROUND_FRICTION : AIR_FRICTION;
      p.vx *= friction;
      if (Math.abs(p.vx) < 0.05) p.vx = 0;
    }

    // Step 3: Jump — independent of horizontal!
    if (this.input.jump && onGround && !this.jumpConsumed) {
      p.vy = JUMP_FORCE;
      p.grounded = false;
      this.jumpConsumed = true;
      audioManager.playSound('jump', 0.4);
    }

    // Gravity
    p.vy = Math.min(p.vy + GRAVITY, MAX_FALL_SPEED);

    // Move X
    p.x += p.vx * (dt / 16.67); // normalize to ~60fps

    // Collision X
    this.resolveCollisionX();

    // Move Y
    p.y += p.vy * (dt / 16.67);

    // Collision Y
    this.resolveCollisionY();

    // Update animation
    this.updateAnimation(dt);

    // Update entities (companion, projectiles)
    this.updateEntities(dt);

    // Update camera
    this.updateCamera();

    // Score
    if (Math.abs(p.vx) > 0.5) {
      this.score += Math.abs(p.vx) * 0.01;
    }

    // Prevent falling out of world
    const worldBottom = this.mapHeight * TILE_SIZE * SCALE + 200;
    if (p.y > worldBottom) {
      this.findStartPosition();
      p.vx = 0;
      p.vy = 0;
      this.lastHorizontal = 'none';
    }
  }

  isSolid(col, row) {
    if (col < 0 || col >= this.mapWidth || row < 0 || row >= this.mapHeight) return false;
    const tileId = this.collisionTiles[row * this.mapWidth + col];
    return tileId > 0 && tileId < 2000000000;
  }

  resolveCollisionX() {
    const p = this.player;
    const ts = TILE_SIZE * SCALE;
    const pw = p.width * PLAYER_SCALE * 0.3;
    const ph = p.height * PLAYER_SCALE * 0.5;

    const left = p.x - pw / 2;
    const right = p.x + pw / 2;
    const top = p.y - ph;
    const bottom = p.y - 2;

    const colLeft = Math.floor(left / ts);
    const colRight = Math.floor(right / ts);
    const rowTop = Math.floor(top / ts);
    const rowBottom = Math.floor(bottom / ts);

    for (let row = rowTop; row <= rowBottom; row++) {
      if (p.vx > 0 && this.isSolid(colRight, row)) {
        p.x = colRight * ts - pw / 2 - 0.1;
        p.vx = 0;
        return;
      }
      if (p.vx < 0 && this.isSolid(colLeft, row)) {
        p.x = (colLeft + 1) * ts + pw / 2 + 0.1;
        p.vx = 0;
        return;
      }
    }

    // World bounds
    if (p.x < pw / 2) { p.x = pw / 2; p.vx = 0; }
    const worldRight = this.mapWidth * ts;
    if (p.x > worldRight - pw / 2) { p.x = worldRight - pw / 2; p.vx = 0; }
  }

  resolveCollisionY() {
    const p = this.player;
    const ts = TILE_SIZE * SCALE;
    const pw = p.width * PLAYER_SCALE * 0.25;
    const ph = p.height * PLAYER_SCALE * 0.5;

    const left = p.x - pw / 2;
    const right = p.x + pw / 2;

    const colLeft = Math.floor(left / ts);
    const colRight = Math.floor(right / ts);

    p.grounded = false;

    if (p.vy >= 0) {
      // Falling — check below
      const rowBelow = Math.floor(p.y / ts);
      for (let col = colLeft; col <= colRight; col++) {
        if (this.isSolid(col, rowBelow)) {
          p.y = rowBelow * ts;
          p.vy = 0;
          p.grounded = true;
          return;
        }
      }
    }

    if (p.vy < 0) {
      // Rising — check above
      const top = p.y - ph;
      const rowAbove = Math.floor(top / ts);
      for (let col = colLeft; col <= colRight; col++) {
        if (this.isSolid(col, rowAbove)) {
          p.y = (rowAbove + 1) * ts + ph;
          p.vy = 0;
          return;
        }
      }
    }
  }

  updateEntities(dt) {
    // 1. Companion logic (lerp to player)
    const c = this.companion;
    const targetX = this.player.facingRight ? this.player.x - 30 : this.player.x + 30;
    const targetY = this.player.y - 20;

    c.x += (targetX - c.x) * 0.1;
    c.y += (targetY - c.y) * 0.1;
    c.facingRight = this.player.facingRight;

    // Companion animation
    c.animTimer += dt;
    if (c.animTimer > 150) {
      c.animTimer = 0;
      c.frame = (c.frame + 1) % 4; // Assuming 4 frames for idle/run
    }

    // 2. Projectiles update
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.x += proj.vx * (dt / 16.67);
      proj.y += proj.vy * (dt / 16.67);
      proj.life--;

      if (proj.life <= 0) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  updateAnimation(dt) {
    const p = this.player;

    // Determine animation state
    let newState = 'idle';
    if (!p.grounded) {
      newState = p.vy < 0 ? 'jump' : 'jump'; // use jump for both rising and falling
    } else if (Math.abs(p.vx) > 0.5) {
      newState = 'run';
    }

    // Lock attack animation until it finishes
    if (this.animState === 'attack') {
      const maxAttackFrames = this.getFrameCount('attack');
      if (this.animFrame >= maxAttackFrames - 1) {
        // Attack finished, allow state to change next tick
        // We do not change it here to let the final frame render
      } else {
        // Still attacking, force newState to attack
        newState = 'attack';
      }
    }

    if (newState !== this.animState) {
      // If we are exiting an attack wait for the final frame to actually show
      this.animState = newState;
      this.animFrame = 0;
      this.animTimer = 0;
    }

    this.animTimer += dt;
    const speed = newState === 'run' ? 80 : 150;
    if (this.animTimer >= speed) {
      this.animTimer = 0;
      const maxFrames = this.getFrameCount(this.animState);
      this.animFrame = (this.animFrame + 1) % maxFrames;
    }
  }

  getFrameCount(state) {
    switch (state) {
      case 'idle': return 4;
      case 'run': return 6;
      case 'jump': return 5;
      case 'attack': return 6;
      case 'crouch': return 2;
      case 'climb': return 3;
      case 'hurt': return 2;
      default: return 4;
    }
  }

  getPlayerFrameKey() {
    const state = this.animState;
    const frame = this.animFrame + 1;
    return `player/${state}/player-${state}-${frame}`;
  }

  updateCamera() {
    const p = this.player;
    const targetX = p.x - this.canvas.width / 2;
    const targetY = p.y - this.canvas.height * 0.6;

    this.camera.x += (targetX - this.camera.x) * 0.08;
    this.camera.y += (targetY - this.camera.y) * 0.06;

    // Clamp
    const worldW = this.mapWidth * TILE_SIZE * SCALE;
    const worldH = this.mapHeight * TILE_SIZE * SCALE;
    this.camera.x = Math.max(0, Math.min(this.camera.x, worldW - this.canvas.width));
    this.camera.y = Math.max(0, Math.min(this.camera.y, worldH - this.canvas.height));
  }

  // ─── Render ───────────────────────────────────────
  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Parallax backgrounds
    this.renderBackground(ctx, w, h);

    ctx.save();
    ctx.translate(-Math.floor(this.camera.x), -Math.floor(this.camera.y));

    // Tilemap
    this.renderTilemap(ctx);

    // Player
    this.renderPlayer(ctx);

    // Entities (Companion, Projectiles)
    this.renderEntities(ctx);

    ctx.restore();
  }

  renderEntities(ctx) {
    // 1. Companion
    const c = this.companion;
    if (this.dinoImg) {
      // Assuming dino spritesheet has 24x24 frames
      const frameW = 24;
      const frameH = 24;
      const sx = c.frame * frameW;
      const sy = 0; // Top row for idle/run
      const drawW = frameW * 2;
      const drawH = frameH * 2;

      ctx.save();
      ctx.translate(Math.floor(c.x), Math.floor(c.y));
      if (!c.facingRight) {
        ctx.scale(-1, 1);
      }
      ctx.drawImage(this.dinoImg, sx, sy, frameW, frameH, -drawW / 2, -drawH, drawW, drawH);
      ctx.restore();
    }

    // 2. Projectiles
    if (this.heroAttackImg && this.projectiles.length > 0) {
      this.projectiles.forEach(proj => {
        ctx.save();
        ctx.translate(Math.floor(proj.x), Math.floor(proj.y));
        
        // Use a frame from the hero attack effect as the fireball
        // Or just draw a glowing circle for simplicity if mapping is hard
        ctx.fillStyle = '#ff6a00';
        ctx.shadowColor = '#ffcc00';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, 0, proj.width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }
  }

  renderBackground(ctx, w, h) {
    // Sky layer — slow parallax
    if (this.backImg) {
      const parallaxX = this.camera.x * 0.1;
      const imgW = this.backImg.width * SCALE;
      const imgH = this.backImg.height * SCALE;
      const startX = -(parallaxX % imgW);

      for (let x = startX; x < w; x += imgW) {
        ctx.drawImage(this.backImg, x, h - imgH, imgW, imgH);
      }
    }

    // Middle layer — medium parallax
    if (this.middleImg) {
      const parallaxX = this.camera.x * 0.3;
      const imgW = this.middleImg.width * SCALE;
      const imgH = this.middleImg.height * SCALE;
      const startX = -(parallaxX % imgW);

      for (let x = startX; x < w; x += imgW) {
        ctx.drawImage(this.middleImg, x, h - imgH, imgW, imgH);
      }
    }
  }

  renderTilemap(ctx) {
    if (!this.tilesetImg || !this.collisionTiles.length) return;

    const ts = TILE_SIZE * SCALE;
    const tilesetCols = Math.floor(this.tilesetImg.width / TILE_SIZE);

    // Only render visible tiles
    const startCol = Math.max(0, Math.floor(this.camera.x / ts) - 1);
    const endCol = Math.min(this.mapWidth, Math.ceil((this.camera.x + this.canvas.width) / ts) + 1);
    const startRow = Math.max(0, Math.floor(this.camera.y / ts) - 1);
    const endRow = Math.min(this.mapHeight, Math.ceil((this.camera.y + this.canvas.height) / ts) + 1);

    for (let row = startRow; row < endRow; row++) {
      for (let col = startCol; col < endCol; col++) {
        let tileId = this.collisionTiles[row * this.mapWidth + col];
        if (tileId <= 0) continue;

        // Handle flipped tiles (Tiled uses high bits for flip flags)
        const FLIPPED_H = 0x80000000;
        const FLIPPED_V = 0x40000000;
        const FLIPPED_D = 0x20000000;
        const flipH = (tileId & FLIPPED_H) !== 0;
        const flipV = (tileId & FLIPPED_V) !== 0;
        tileId = tileId & 0x0FFFFFFF;

        if (tileId <= 0) continue;

        const tileIndex = tileId - 1; // Tiled is 1-indexed
        const srcCol = tileIndex % tilesetCols;
        const srcRow = Math.floor(tileIndex / tilesetCols);

        const dx = col * ts;
        const dy = row * ts;

        ctx.save();
        if (flipH || flipV) {
          ctx.translate(dx + ts / 2, dy + ts / 2);
          ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
          ctx.translate(-ts / 2, -ts / 2);
          ctx.drawImage(
            this.tilesetImg,
            srcCol * TILE_SIZE, srcRow * TILE_SIZE, TILE_SIZE, TILE_SIZE,
            0, 0, ts, ts
          );
        } else {
          ctx.drawImage(
            this.tilesetImg,
            srcCol * TILE_SIZE, srcRow * TILE_SIZE, TILE_SIZE, TILE_SIZE,
            dx, dy, ts, ts
          );
        }
        ctx.restore();
      }
    }
  }

  renderPlayer(ctx) {
    const p = this.player;
    let state = this.animState;
    
    let img = this.heroSprites[state];
    if (!img) img = this.heroSprites.idle;

    if (!img || img.width === 0 || img.height === 0) {
      // Fallback
      ctx.fillStyle = '#ff9d00';
      ctx.fillRect(p.x - 12, p.y - 28, 24, 28);
      return;
    }

    // Gothicvania sprites are typically arranged in a single row
    // We assume the number of frames is predetermined
    const maxFrames = this.getFrameCount(state);
    const frameW = img.width / maxFrames;
    const frameH = img.height;

    const drawW = frameW * PLAYER_SCALE;
    const drawH = frameH * PLAYER_SCALE;

    ctx.save();
    ctx.translate(Math.floor(p.x), Math.floor(p.y));

    if (!p.facingRight) {
      ctx.scale(-1, 1);
    }

    ctx.drawImage(
      img,
      this.animFrame * frameW, 0, frameW, frameH,
      -drawW / 2 + 10, -drawH + 10, drawW, drawH // minor manual offset for ground alignment
    );

    ctx.restore();
  }
}

export default GameEngine;
