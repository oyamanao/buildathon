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
const JUMP_FORCE = -9.5;       // Reduced for a snappier, less floaty jump
const TILE_SIZE = 16;
const SCALE = 4.5;
const PLAYER_SCALE = 4;

// ─── Game Engine Class ────────────────────────────────
export class GameEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    // Assets
    this.atlasImg = null;
    this.atlasData = null;
    // 5-layer dark forest parallax backgrounds (far → near)
    this.forestLayers = [null, null, null, null, null];
    this.mapData = null;
    this.dinoImg = null;
    this.groundCacheCanvas = null; // pre-rendered ground strip
    this.heroAttackImg = null;
    this.skeletonDieImg = null;   // skeleton death sprite sheet for decorations
    this.skeletonDecorations = []; // { x, frame, flip } positions on ground
    
    this.heroSprites = { idle: null, run: null, jump: null, attack: null };

    // Footstep sound timer
    this.footstepTimer = 0;
    this.footstepInterval = 280; // ms between footstep sounds

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
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      frame: 0,
      animTimer: 0,
      state: 'FOLLOW', // FOLLOW, LUNGE, CHARGE, RECOVER
      attackTimer: 0,
      targetX: 0,
      targetY: 0
    };

    // Projectiles
    this.projectiles = []; // { x, y, vx, vy, life, size, growing }

    // ─── GESTURE COMBO SYSTEM ────────────────────────
    // Replace voice with input combos:
    //   R → R → Jump = Sword Attack
    //   L → R → Jump = Fireball (Spell)
    this.gestureBuffer = [];      // last 3 inputs: 'R', 'L', 'J'
    this.gestureTimeout = null;   // clear buffer after 800ms idle
    this.comboDisplay = '';       // show current combo on HUD
    this.comboDisplayTimer = 0;

    // ─── TWO-CHANNEL INPUT ────────────────────────────
    this.input = {
      jump: false,        
      horizontal: 'none', 
      mode: 'MOVE'
    };
    this.jumpConsumed = false;
    this.lastHorizontal = 'none';

    // ─── ENEMIES (DRAGONS) ───────────────────────────
    this.enemies = [];

    // ─── CHARGE / KILL METER ─────────────────────────
    this.charge = 0;            // 0-100
    this.chargeMax = 100;
    this.explosionActive = false;
    this.explosionTimer = 0;
    this.explosionDuration = 800; // ms
    this.kills = 0;

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

    // Dash
    this.dashTimer = 0;
    this.dashCooldown = 0;
  }

  async load() {
    try {
      // Preload Audio (BGM + SFX)
      await audioManager.load({
        'bgm': '/assets/audio/Chill RPG theme (RPG).wav',
        'jump': '/assets/audio/Leap (Gj3).wav',
        'attack': '/assets/audio/Sword Slash (Rpg).wav',
        'spell': '/assets/audio/Dagger Basic Attack Combo.wav',
        'step': '/assets/audio/Footsteps Loop 1 (Rpg).wav'
      });

      const [forest1, forest2, forest3, forest4, forest5,
             mapData, dinoImg, skeletonDieImg,
             heroIdle, heroRun, heroJump, heroAttack] = await Promise.all([
        // 5-layer dark forest parallax (far → near)
        loadImage('/assets/environment/dark_forest/dark_forest_1.png'),
        loadImage('/assets/environment/dark_forest/dark_forest_2.png'),
        loadImage('/assets/environment/dark_forest/dark_forest_3.png'),
        loadImage('/assets/environment/dark_forest/dark_forest_4.png'),
        loadImage('/assets/environment/dark_forest/dark_forest_5.png'),
        loadJSON('/assets/maps/map.json'),
        loadImage('/assets/sprites/dino-red.png'),
        loadImage('/assets/sprites/skeleton/skeleton_die.png'),
        loadImage('/assets/sprites/hero-idle.png'),
        loadImage('/assets/sprites/hero-run.png'),
        loadImage('/assets/sprites/hero-jump.png'),
        loadImage('/assets/sprites/hero-attack.png'),
      ]);

      this.forestLayers = [forest1, forest2, forest3, forest4, forest5];
      this.mapData = mapData;
      
      // Process dino image to remove its solid background color (the 'box')
      this.dinoImg = this.makeTransparent(dinoImg, 255, 255, 255); // Assuming white/light bg, will tune if needed
      
      this.skeletonDieImg = skeletonDieImg;
      
      // Store hero sprites in an object for easy access
      this.heroSprites = {
        idle: heroIdle,
        run: heroRun,
        jump: heroJump,
        attack: heroAttack
      };

      // Generate a flat tutorial plane spanning 100 columns.
      this.mapWidth = 100;
      this.mapHeight = 25;
      this.collisionTiles = new Array(this.mapWidth * this.mapHeight).fill(0);

      // ── Build ground collision ──
      // Use simple flags: 1 = solid ground, 0 = empty
      // Surface row (row 18 is the ground surface)
      const GROUND_ROW = 18;
      this.groundRow = GROUND_ROW;
      
      for (let c = 0; c < this.mapWidth; c++) {
        // Surface layer and everything below is solid
        for (let r = GROUND_ROW; r < this.mapHeight; r++) {
          this.collisionTiles[r * this.mapWidth + c] = 1;
        }
      }

      // Add random floating logs (platforms) in the air
      for (let c = 10; c < this.mapWidth - 5; c += 8 + Math.floor(Math.random() * 6)) {
        const h = GROUND_ROW - 3 - Math.floor(Math.random() * 3); // 3-5 tiles above ground
        this.collisionTiles[h * this.mapWidth + c] = 2; // tile 2 = log
        this.collisionTiles[h * this.mapWidth + c + 1] = 2;
        this.collisionTiles[h * this.mapWidth + c + 2] = 2; // 3 blocks wide
      }

      // Pre-render the ground strip into an offscreen canvas
      this.buildGroundCache();

      // Generate static skeleton decorations scattered on the ground
      this.generateSkeletonDecorations();

      // Spawn dragon enemies across the map
      this.spawnEnemies();

      // Find a good starting position
      this.findStartPosition();

      // Start BGM
      audioManager.playBgm('bgm', 0.15);

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

  pushGesture(g) {
    const now = performance.now();
    // Strict 300ms window between any two gestures
    if (this.lastGestureTime > 0 && now - this.lastGestureTime > 300) {
      this.gestureBuffer = [];
    }
    this.lastGestureTime = now;
    this.gestureBuffer.push(g);
    if (this.gestureBuffer.length > 5) this.gestureBuffer.shift();
  }

  /**
   * Set input — now includes strict gesture timing.
   * Dash (RR/LL) works during any movement.
   */
  setInput(jump, horizontal, mode = 'MOVE') {
    this.input.mode = mode;

    // Detect new inputs for combo buffer
    const prevJump = this.input.jump;
    const prevHoriz = this.input.horizontal;

    if (horizontal === 'right' && prevHoriz !== 'right') {
      this.pushGesture('R');
    } else if (horizontal === 'left' && prevHoriz !== 'left') {
      this.pushGesture('L');
    }
    if (jump && !prevJump) {
      this.pushGesture('J');
    }

    let comboFired = false;
    const bufStr = this.gestureBuffer.join('');
    
    if (bufStr.endsWith('RRJR')) {
      // SWORD ATTACK 1: Right → Right → Jump → Right
      comboFired = this.swordAttack(1);
      if (comboFired) {
        this.comboDisplay = '⚔ SWORD SLASH!';
        this.comboDisplayTimer = 1200;
        this.gestureBuffer = [];
      }
    } else if (bufStr.endsWith('LLJL')) {
      // SWORD ATTACK 2: Left → Left → Jump → Left
      comboFired = this.swordAttack(2);
      if (comboFired) {
        this.comboDisplay = '🌀 SPIN ATTACK!';
        this.comboDisplayTimer = 1200;
        this.gestureBuffer = [];
      }
    } else if (bufStr.endsWith('LRJ')) {
      // MAGIC 1: Left → Right → Jump (Fireball)
      comboFired = this.castSpell(1);
      if (comboFired) {
        this.comboDisplay = '🔥 FIREBALL!';
        this.comboDisplayTimer = 1200;
        this.gestureBuffer = [];
      }
    } else if (bufStr.endsWith('RLJ')) {
      // MAGIC 2: Right → Left → Jump (Thunder Bolt)
      comboFired = this.castSpell(2);
      if (comboFired) {
        this.comboDisplay = '⚡ THUNDER BOLT!';
        this.comboDisplayTimer = 1200;
        this.gestureBuffer = [];
      }
    }

    // Normal movement still works
    if (jump && !prevJump) {
      this.jumpConsumed = false;
    }
    this.input.jump = jump;
    this.input.horizontal = horizontal;

    if (horizontal !== 'none') {
      this.lastHorizontal = horizontal;
    }

    // Update dash ghosts if active
    if (this.dashTimer > 0) {
      if (!this.dashGhosts) this.dashGhosts = [];
      this.dashGhosts.push({ x: this.player.x, y: this.player.y, alpha: 0.6, state: this.animState, frame: this.animFrame, facing: this.player.facingRight });
      if (this.dashGhosts.length > 5) this.dashGhosts.shift();
    } else {
      this.dashGhosts = [];
    }

    // Reset buffer if idle for too long (strict timing)
    if (this.lastGestureTime > 0 && performance.now() - this.lastGestureTime > 300) {
      this.gestureBuffer = [];
    }

    return comboFired;
  }

  setMode(mode) {
    this.input.mode = mode;
  }

  castSpell(type = 1) {
    // Cooldown
    const cooldown = type === 1 ? 600 : 1000;
    if (performance.now() - (this.lastSpellTime || 0) < cooldown) return false;
    this.lastSpellTime = performance.now();
    
    // Initiate the Pet Attack Sequence
    const c = this.companion;
    const p = this.player;
    
    c.state = 'LUNGE';
    c.attackTimer = 0;
    c.spellType = type;
    // Target a spot in front of the player
    c.targetX = p.facingRight ? p.x + 180 : p.x - 180;
    c.targetY = p.y - 60;
    
    return true;
  }

  swordAttack(type = 1) {
    if (performance.now() - (this.lastSwordTime || 0) < 350) return false;
    this.lastSwordTime = performance.now();
    audioManager.playSound('attack', 0.5);

    this.animState = 'attack';
    this.animFrame = 0;
    this.animTimer = 0;

    // Melee hitbox
    this.checkMeleeHit(type);
    return true;
  }

  checkMeleeHit(type = 1) {
    const p = this.player;
    const reach = type === 1 ? 70 : 100;
    const damage = type === 1 ? 40 : 80;
    
    // Type 2 (Spin) hits in a circle around player
    // Type 1 (Slash) hits in front
    
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) continue;
      
      const dx = Math.abs(e.x - p.x);
      const dy = Math.abs(e.y - (p.y - p.height / 2));
      
      let isHit = false;
      if (type === 2) {
        // Circular hit
        isHit = dx < reach && dy < reach;
      } else {
        // Forward hit
        const hitX = p.facingRight ? p.x + (reach/2) : p.x - (reach/2);
        isHit = Math.abs(e.x - hitX) < (reach/2) && dy < 50;
      }

      if (isHit) {
        e.hp -= damage;
        e.hitFlash = 200;
        if (e.hp <= 0) {
          e.dead = true;
          e.deathTimer = 60000; // Stay dead for 60s
          this.kills++;
          this.charge = Math.min(this.chargeMax, this.charge + 25);
          this.score += type === 1 ? 50 : 100;
        }
      }
    }
  }

  checkProjectileHits() {
    for (let pi = this.projectiles.length - 1; pi >= 0; pi--) {
      const proj = this.projectiles[pi];
      
      // Enemy projectile hitting player
      if (proj.type === 'enemy-fire') {
        const dx = Math.abs(this.player.x - proj.x);
        const dy = Math.abs((this.player.y - this.player.height/2) - proj.y);
        if (dx < 35 && dy < 35) {
          this.damageFlash = 300; // Red screen effect
          proj.life = 0; // consume projectile
          audioManager.playSound('attack', 0.7); // damage sound
          // Simple knockback
          this.player.vx = proj.vx > 0 ? 8 : -8;
          this.player.vy = -4;
        }
        continue;
      }

      // Friendly projectile hitting enemies
      for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
        const e = this.enemies[ei];
        if (e.dead) continue;
        const dx = Math.abs(e.x - proj.x);
        const dy = Math.abs(e.y - proj.y);
        // Larger hitbox for the massive fireball
        const hitRad = proj.size > 50 ? 50 : 40; 
        if (dx < hitRad && dy < hitRad) {
          e.hp -= proj.type === 'thunder' ? 100 : 70;
          e.hitFlash = 200;
          proj.life = 0; // consume projectile
          if (e.hp <= 0) {
            e.dead = true;
            e.deathTimer = 1000; // Allow 1s fade out (fixed from 60s)
            this.kills++;
            this.charge = Math.min(this.chargeMax, this.charge + 25);
            this.score += proj.type === 'thunder' ? 120 : 75;
          }
        }
      }
    }
  }

  triggerExplosion() {
    if (this.charge < this.chargeMax) return;
    this.charge = 0;
    this.explosionActive = true;
    this.explosionTimer = 0;
    audioManager.playSound('spell', 1.0);

    // Kill ALL enemies on screen
    for (const e of this.enemies) {
      if (!e.dead) {
        e.dead = true;
        e.deathTimer = 600;
        this.kills++;
        this.score += 100;
      }
    }
    this.comboDisplay = '💥 MEGA EXPLOSION!';
    this.comboDisplayTimer = 2000;
  }

  /**
   * Spawn dragon enemies across the map.
   * Uses dino-red.png rendered larger with a reddish tint.
   */
  spawnEnemies() {
    const ts = TILE_SIZE * SCALE;
    const groundY = this.groundRow * ts;

    // Seeded random
    const rng = (seed) => {
      let s = seed;
      return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
    };
    const rand = rng(9999);

    // Spawn 8-12 dragons spread across the map
    const count = 8 + Math.floor(rand() * 5);
    this.enemies = [];
    
    for (let i = 0; i < count; i++) {
      const x = 400 + (i / count) * (this.mapWidth * ts - 600);
      this.enemies.push({
        x: x + (rand() - 0.5) * 150,
        y: groundY - 2, // stand on ground
        hp: 80,
        maxHp: 80,
        speed: 0.5 + rand() * 0.8,
        patrolLeft: x - 80,
        patrolRight: x + 80 + rand() * 120,
        facingRight: rand() > 0.5,
        frame: Math.floor(rand() * 4),
        animTimer: 0,
        dead: false,
        deathTimer: 0,
        hitFlash: 0,
        respawnTimer: 0
      });
    }
  }

  getGestureName() {
    if (this.comboDisplay && this.comboDisplayTimer > 0) return this.comboDisplay;
    const buf = this.gestureBuffer.slice(-3).join('→');
    if (buf) return `Combo: ${buf}`;
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

    // Update enemies
    this.updateEnemies(dt);

    // Check projectile → enemy hits
    this.checkProjectileHits();

    // Update camera
    this.updateCamera();

    // Combo display timer
    if (this.comboDisplayTimer > 0) {
      this.comboDisplayTimer -= dt;
    }

    // Dash timer
    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      // Maintain speed during dash
      p.vx = p.vx > 0 ? Math.max(p.vx, 8) : Math.min(p.vx, -8);
    }

    // Damage flash decay
    if (this.damageFlash > 0) {
      this.damageFlash -= dt;
    }

    // Explosion update
    if (this.explosionActive) {
      this.explosionTimer += dt;
      if (this.explosionTimer >= this.explosionDuration) {
        this.explosionActive = false;
      }
    }

    // Auto-trigger explosion when charge is full
    if (this.charge >= this.chargeMax && !this.explosionActive) {
      this.triggerExplosion();
    }

    // Footstep sounds when running on ground
    if (p.grounded && Math.abs(p.vx) > 0.5) {
      this.footstepTimer += dt;
      if (this.footstepTimer >= this.footstepInterval) {
        this.footstepTimer = 0;
        audioManager.playSound('step', 0.25);
      }
    } else {
      this.footstepTimer = this.footstepInterval;
    }

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
    // 1. Companion / Pet logic with State Machine
    const c = this.companion;
    const p = this.player;

    if (c.state === 'FOLLOW') {
      const followX = p.facingRight ? p.x - 60 : p.x + 60;
      const followY = p.y - 80;
      c.x += (followX - c.x) * 0.1;
      c.y += (followY - c.y) * 0.1;
    } else if (c.state === 'LUNGE') {
      c.x += (c.targetX - c.x) * 0.2;
      c.y += (c.targetY - c.y) * 0.2;
      if (Math.abs(c.x - c.targetX) < 10) {
        c.state = 'CHARGE';
        c.attackTimer = 0;
        audioManager.playSound('spell', 0.4); // Charging sound start
      }
    } else if (c.state === 'CHARGE') {
      c.attackTimer += dt;
      // Hover slightly while charging
      c.y += Math.sin(performance.now() * 0.01) * 0.5;
      
      if (c.attackTimer > 600) {
        c.state = 'FIRE';
      }
    } else if (c.state === 'FIRE') {
      const type = c.spellType || 1;
      const vx = p.facingRight ? (type === 1 ? 9 : 15) : (type === 1 ? -9 : -15);
      
      audioManager.playSound('attack', 0.7);
      
      // Fire from MOUTH (forward offset)
      const mouthOffsetX = p.facingRight ? 35 : -35;
      
      this.projectiles.push({
        x: c.x + mouthOffsetX,
        y: c.y - 45,
        vx,
        vy: 0,
        width: type === 1 ? 28 : 18,
        height: type === 1 ? 28 : 18,
        life: 180,
        size: type === 1 ? 28 : 18,
        type: type === 1 ? 'fireball' : 'thunder',
        growing: type === 1
      });
      
      c.state = 'RECOVER';
    } else if (c.state === 'RECOVER') {
      const followX = p.facingRight ? p.x - 60 : p.x + 60;
      const followY = p.y - 80;
      c.x += (followX - c.x) * 0.15;
      c.y += (followY - c.y) * 0.15;
      if (Math.abs(c.x - followX) < 10) {
        c.state = 'FOLLOW';
      }
    }

    c.facingRight = (c.state === 'FOLLOW' || c.state === 'RECOVER') ? p.facingRight : (c.x < p.x ? false : true);
    if (c.state === 'LUNGE' || c.state === 'CHARGE') {
      c.facingRight = p.facingRight; // Face where player was facing
    }

    // Companion animation
    c.animTimer += dt;
    if (c.animTimer > 150) {
      c.animTimer = 0;
      c.frame = (c.frame + 1) % 4;
    }

    // 2. Projectiles update
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.x += proj.vx * (dt / 16.67);
      proj.y += proj.vy * (dt / 16.67);
      proj.life--;

      if (proj.growing && proj.size < 72) {
        proj.size += 0.8;
        proj.width = proj.size;
        proj.height = proj.size;
      }

      if (proj.life <= 0) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  updateEnemies(dt) {
    const ts = TILE_SIZE * SCALE;
    const groundY = this.groundRow * ts;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      // Hit flash decay
      if (e.hitFlash > 0) e.hitFlash -= dt;

      if (e.dead) {
        e.deathTimer -= dt;
        e.vx = 0; // stop moving
        e.frame = 16; // death frame (corpse)
        // Completely remove enemy once death timer runs out (faded)
        if (e.deathTimer <= 0) {
          this.enemies.splice(i, 1);
        }
        continue;
      }

      // Dragon Fireball Attack (only if near player)
      const distToPlayer = Math.abs(this.player.x - e.x);
      if (distToPlayer < 700) {
        e.attackTimer = (e.attackTimer || 0) + dt;
        if (e.attackTimer > 2500 + Math.random() * 2000) {
          e.attackTimer = 0;
          audioManager.playSound('spell', 0.5); // Use spell sound for fire as placeholder
          this.projectiles.push({
            x: e.facingRight ? e.x + 30 : e.x - 30, // shoot from mouth
            y: e.y - 12,
            vx: e.facingRight ? 12 : -12,
            vy: 0,
            width: 28,
            height: 28,
            life: 150,
            size: 28,
            type: 'enemy-fire',
            growing: false
          });
        }
      }

      // Patrol back and forth
      if (e.facingRight) {
        e.x += e.speed * (dt / 16.67);
        if (e.x >= e.patrolRight) {
          e.facingRight = false;
        }
      } else {
        e.x -= e.speed * (dt / 16.67);
        if (e.x <= e.patrolLeft) {
          e.facingRight = true;
        }
      }

      // Animation
      e.animTimer += dt;
      if (e.animTimer > 180) {
        e.animTimer = 0;
        e.frame = (e.frame + 1) % 4;
      }

      // Dragon Aggressive AI
      const p = this.player;
      const dist = Math.abs(e.x - p.x);
      
      // Update attack timer
      e.attackTimer = (e.attackTimer || 0) + dt;

      if (dist < 400 && dist > 150 && e.attackTimer > 2000) {
        // Range Attack: Fire Breath
        e.attackTimer = 0;
        this.projectiles.push({
          x: e.x,
          y: e.y - 30,
          vx: e.x < p.x ? 4 : -4,
          vy: 0,
          width: 20,
          height: 20,
          life: 100,
          type: 'dragon-fire',
          isEnemy: true
        });
      } else if (dist < 150 && e.attackTimer > 1500) {
        // Melee Attack: Lunge
        e.attackTimer = 0;
        e.x += e.x < p.x ? 60 : -60; // quick lunge
      }

      const dx = Math.abs(e.x - p.x);
      const dy = Math.abs(e.y - (p.y - p.height / 2));
      if (dx < 45 && dy < 50) {
        // Only damage if not in invincibility frames
        const now = performance.now();
        if (!this.lastHitTime || now - this.lastHitTime > 800) {
          this.lastHitTime = now;
          // Knockback
          p.vx = e.x < p.x ? 7 : -7;
          p.vy = -6;
          p.grounded = false;
          // Damage: lose score
          this.score = Math.max(0, this.score - 50);
          // Flash screen red briefly
          this.damageFlash = 300;
        }
      }
    }
  }

  updateAnimation(dt) {
    const p = this.player;

    // Determine animation state based on physics
    let newState = 'idle';
    if (!p.grounded) {
      // Use distinct rise/fall phases for jump animation
      newState = 'jump';
    } else if (Math.abs(p.vx) > 0.5) {
      newState = 'run';
    }

    // Lock attack animation until it finishes
    if (this.animState === 'attack') {
      const maxAttackFrames = this.getFrameCount('attack');
      if (this.animFrame >= maxAttackFrames - 1) {
        // Attack finished, allow state to change next tick
      } else {
        newState = 'attack';
      }
    }

    if (newState !== this.animState) {
      this.animState = newState;
      this.animFrame = 0;
      this.animTimer = 0;
    }

    this.animTimer += dt;
    const speed = newState === 'run' ? 80 : (newState === 'jump' ? 100 : 150);
    if (this.animTimer >= speed) {
      this.animTimer = 0;
      const maxFrames = this.getFrameCount(this.animState);

      if (this.animState === 'jump') {
        // For jump: advance frames but clamp to the last frame while airborne
        // This gives a proper rise→apex→fall arc feel
        if (p.vy < -2) {
          // Rising: use frames 0-1 (takeoff)
          this.animFrame = Math.min(this.animFrame + 1, 1);
        } else if (p.vy < 2) {
          // Apex: use frame 2
          this.animFrame = 2;
        } else {
          // Falling: use frame 3 (last frame), clamp there
          this.animFrame = Math.min(maxFrames - 1, 3);
        }
      } else {
        this.animFrame = (this.animFrame + 1) % maxFrames;
      }
    }
  }

  getFrameCount(state) {
    switch (state) {
      case 'idle': return 4;
      case 'run': return 6;
      case 'jump': return 4;    // Fixed: sprite only has 4 frames
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

    // Static skeleton decorations (behind player)
    this.renderSkeletonDecorations(ctx);

    // Enemies (dragons)
    this.renderEnemies(ctx);

    // 3. Dash Ghosts (Trail)
    if (this.dashGhosts && this.dashGhosts.length > 0) {
      this.dashGhosts.forEach((g, i) => {
        ctx.save();
        ctx.globalAlpha = (i / this.dashGhosts.length) * 0.4;
        ctx.translate(Math.floor(g.x), Math.floor(g.y));
        if (!g.facing) ctx.scale(-1, 1);
        
        const frameKey = `player/${g.state}/player-${g.state}-${g.frame + 1}`;
        const frame = this.spriteFrames[frameKey];
        if (frame) {
          const dw = frame.w * PLAYER_SCALE;
          const dh = frame.h * PLAYER_SCALE;
          ctx.filter = 'cyan(1) brightness(2)'; // Ghostly color
          ctx.drawImage(frame.img, frame.x, frame.y, frame.w, frame.h, -dw / 2, -dh, dw, dh);
        }
        ctx.restore();
      });
    }

    // 4. Player
    this.renderPlayer(ctx);

    // Entities (Companion, Projectiles)
    this.renderEntities(ctx);

    ctx.restore();

    // Explosion screen flash (post-restore, full canvas overlay)
    if (this.explosionActive) {
      const progress = this.explosionTimer / this.explosionDuration;
      const alpha = Math.max(0, 1 - progress);
      
      // White flash
      ctx.fillStyle = `rgba(255, 200, 50, ${alpha * 0.6})`;
      ctx.fillRect(0, 0, w, h);
      
      // Shockwave ring
      const ringR = progress * Math.max(w, h) * 0.8;
      ctx.strokeStyle = `rgba(255, 100, 0, ${alpha})`;
      ctx.lineWidth = 8 * (1 - progress) + 2;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, ringR, 0, Math.PI * 2);
      ctx.stroke();
      
      // Inner ring
      ctx.strokeStyle = `rgba(255, 255, 200, ${alpha * 0.8})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, ringR * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Damage flash (red screen on hit)
    if (this.damageFlash > 0) {
      const alpha = Math.min(0.4, this.damageFlash / 300 * 0.4);
      ctx.fillStyle = `rgba(255, 0, 0, ${alpha})`;
      ctx.fillRect(0, 0, w, h);
    }

    // HUD: Charge Bar
    this.renderHUD(ctx, w, h);
  }

  renderHUD(ctx, w, h) {
    // Charge bar (bottom center)
    const barW = 200;
    const barH = 14;
    const barX = (w - barW) / 2;
    const barY = h - 40;
    const fillRatio = this.charge / this.chargeMax;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    
    // Fill with gradient from blue → orange → red
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0, '#3366ff');
    grad.addColorStop(0.5, '#ff8800');
    grad.addColorStop(1, '#ff2200');
    ctx.fillStyle = grad;
    ctx.fillRect(barX, barY, barW * fillRatio, barH);
    
    // Border
    ctx.strokeStyle = fillRatio >= 1 ? '#ffdd00' : '#888';
    ctx.lineWidth = fillRatio >= 1 ? 2 : 1;
    ctx.strokeRect(barX - 2, barY - 2, barW + 4, barH + 4);

    // Label
    ctx.font = '10px monospace';
    ctx.fillStyle = fillRatio >= 1 ? '#ffdd00' : '#ccc';
    ctx.textAlign = 'center';
    ctx.fillText(fillRatio >= 1 ? '⚡ BOOM READY! ⚡' : `CHARGE ${Math.floor(fillRatio * 100)}%`, w / 2, barY - 5);

    // Kills counter
    ctx.textAlign = 'left';
    ctx.font = '11px monospace';
    ctx.fillStyle = '#ff6644';
    ctx.fillText(`💀 Kills: ${this.kills}`, 20, h - 30);

    // Combo display
    if (this.comboDisplayTimer > 0 && this.comboDisplay) {
      const alpha = Math.min(1, this.comboDisplayTimer / 400);
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 22px monospace';
      ctx.fillStyle = '#ffcc00';
      ctx.textAlign = 'center';
      ctx.fillText(this.comboDisplay, w / 2, h / 2 - 60);
      ctx.globalAlpha = 1;
    }

    // Gesture buffer hint
    if (this.gestureBuffer.length > 0 && this.comboDisplayTimer <= 0) {
      ctx.font = '10px monospace';
      ctx.fillStyle = '#aaa';
      ctx.textAlign = 'center';
      ctx.fillText(`[${this.gestureBuffer.join('→')}]`, w / 2, barY + barH + 16);
    }

    ctx.textAlign = 'left'; // reset
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
      const drawW = frameW * 3;
      const drawH = frameH * 3;

      ctx.save();
      ctx.translate(Math.floor(c.x), Math.floor(c.y));

      if (c.facingRight) ctx.scale(-1, 1); // Natively faces LEFT

      // CHARGING EFFECT
      if (c.state === 'CHARGE') {
        const glowSize = (c.attackTimer / 600) * 45;
        const color = c.spellType === 2 ? '0, 200, 255' : '255, 100, 0';
        
        // Offset to mouth (local coords)
        const mx = -15; 
        const my = -45; // Moved up to head level (was -10, which is feet/ass)
        
        const gradient = ctx.createRadialGradient(mx, my, 0, mx, my, glowSize);
        gradient.addColorStop(0, `rgba(${color}, 0.9)`);
        gradient.addColorStop(0.6, `rgba(${color}, 0.4)`);
        gradient.addColorStop(1, `rgba(${color}, 0)`);
        
        ctx.fillStyle = gradient;
        ctx.shadowBlur = 20;
        ctx.shadowColor = `rgb(${color})`;
        ctx.beginPath();
        ctx.arc(mx, my, glowSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Intensity pulse
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(mx, my, glowSize * 0.4 * (0.8 + Math.sin(performance.now()*0.02)*0.2), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.drawImage(this.dinoImg, sx, sy, frameW, frameH, -drawW / 2, -drawH, drawW, drawH);
      ctx.restore();
    }

    // 2. Projectiles — enhanced variety
    if (this.projectiles.length > 0) {
      this.projectiles.forEach(proj => {
        ctx.save();
        ctx.translate(Math.floor(proj.x), Math.floor(proj.y));
        
        const r = (proj.size || proj.width) / 2;
        const type = proj.type || 'fireball';
        
        // Colors based on magic type
        let mainColor = '#ff8800';
        let glowColor = '#ff4400';
        let coreColor = '#ffee88';
        
        if (type === 'thunder') {
          mainColor = '#00ffff';
          glowColor = '#0088ff';
          coreColor = '#ffffff';
        } else if (type === 'dragon-fire') {
          mainColor = '#cc00ff';
          glowColor = '#6600aa';
          coreColor = '#ffccff';
        }

        // Outer glow
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = type === 'thunder' ? 30 : 20;
        
        // Main body
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner bright core
        ctx.shadowBlur = 0;
        ctx.fillStyle = coreColor;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
        ctx.fill();

        // Trail particles
        for (let t = 1; t <= 3; t++) {
          ctx.globalAlpha = 0.3 / t;
          ctx.fillStyle = '#ff8800';
          ctx.beginPath();
          ctx.arc(-proj.vx * t * 2, 0, r * (0.7 / t), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        
        ctx.restore();
      });
    }
  }

  renderEnemies(ctx) {
    if (!this.dinoImg) return;

    const frameW = 24;
    const frameH = 24;
    const drawScale = 4.5; // Dragons are bigger

    for (const e of this.enemies) {
      if (e.dead && e.deathTimer <= 0) continue;

      const drawW = frameW * drawScale;
      const drawH = frameH * drawScale;

      ctx.save();
      ctx.translate(Math.floor(e.x), Math.floor(e.y));

      if (e.dead) {
        const alpha = Math.max(0, e.deathTimer / 1000);
        ctx.globalAlpha = alpha;
        if (alpha <= 0) {
          ctx.globalAlpha = 1;
          ctx.restore();
          continue; 
        }
      }

      // Hit flash
      if (e.hitFlash > 0) {
        ctx.filter = 'brightness(3)';
      }

      if (e.facingRight) {
        ctx.scale(-1, 1); // Native face LEFT
      }

      // Draw the dino sprite as dragon — NO box overlay
      const sx = e.frame * frameW;
      ctx.drawImage(this.dinoImg, sx, 0, frameW, frameH, -drawW / 2, -drawH, drawW, drawH);

      ctx.filter = 'none';

      // Reset flip for HP bar
      if (!e.facingRight) {
        ctx.scale(-1, 1);
      }
      ctx.globalAlpha = 1;

      // HP bar (above enemy)
      if (!e.dead) {
        const hpW = 40;
        const hpH = 4;
        const hpRatio = e.hp / e.maxHp;
        
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-hpW / 2, -drawH - 10, hpW, hpH);
        ctx.fillStyle = hpRatio > 0.5 ? '#44ff44' : (hpRatio > 0.25 ? '#ffaa00' : '#ff3333');
        ctx.fillRect(-hpW / 2, -drawH - 10, hpW * hpRatio, hpH);
      }

      ctx.restore();
    }
  }

  renderBackground(ctx, w, h) {
    // 5-layer dark forest parallax (far → near)
    // Each layer scrolls at increasing speed for depth effect
    const parallaxSpeeds = [0.02, 0.06, 0.12, 0.22, 0.35];

    for (let i = 0; i < this.forestLayers.length; i++) {
      const img = this.forestLayers[i];
      if (!img || img.width <= 1) continue;

      const parallaxX = this.camera.x * parallaxSpeeds[i];
      const imgScale = SCALE * 1.2; // Slightly larger scale for full coverage
      const imgW = img.width * imgScale;
      const imgH = img.height * imgScale;
      const startX = -(parallaxX % imgW);

      if (i === 0) {
        // First layer (sky): stretch to fill entire canvas
        for (let x = startX; x < w; x += imgW) {
          ctx.drawImage(img, x, 0, imgW, h);
        }
      } else {
        // Tree/foliage layers: anchor to bottom
        for (let x = startX; x < w; x += imgW) {
          ctx.drawImage(img, x, h - imgH, imgW, imgH);
        }
      }
    }
  }

  /**
   * Pre-render a reusable ground strip into an offscreen canvas.
   * This avoids per-frame tile logic and gives us a clean dark forest floor.
   */
  buildGroundCache() {
    const ts = TILE_SIZE * SCALE;
    const groundDepth = (this.mapHeight - this.groundRow) * ts;
    const totalWidth = this.mapWidth * ts;

    const cache = document.createElement('canvas');
    cache.width = totalWidth;
    cache.height = groundDepth + 12; // +12 for grass overhang
    const g = cache.getContext('2d');

    // ── Dirt fill ──
    // Dark earthy gradient matching the forest floor
    const dirtGrad = g.createLinearGradient(0, 0, 0, groundDepth);
    dirtGrad.addColorStop(0, '#2a1a0e');   // Dark humus top
    dirtGrad.addColorStop(0.3, '#1e1208'); // Rich dark soil
    dirtGrad.addColorStop(1, '#0d0804');   // Deep black earth
    g.fillStyle = dirtGrad;
    g.fillRect(0, 6, totalWidth, groundDepth);

    // ── Scattered rocks/roots texture ──
    const rng = (seed) => {
      let s = seed;
      return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
    };
    const rand = rng(42);

    // Rock speckles
    for (let i = 0; i < 300; i++) {
      const rx = rand() * totalWidth;
      const ry = 10 + rand() * (groundDepth - 20);
      const rs = 1 + rand() * 3;
      g.fillStyle = `rgba(${40 + rand() * 30}, ${25 + rand() * 20}, ${15 + rand() * 15}, ${0.3 + rand() * 0.4})`;
      g.fillRect(rx, ry, rs, rs);
    }

    // Root lines
    for (let i = 0; i < 40; i++) {
      const rx = rand() * totalWidth;
      const ry = 8 + rand() * 30;
      g.strokeStyle = `rgba(60, 35, 20, ${0.2 + rand() * 0.3})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(rx, ry);
      g.lineTo(rx + 10 + rand() * 30, ry + rand() * 8 - 4);
      g.stroke();
    }

    // ── Grass/moss top edge ──
    // Draw a wavy grass line along the top
    for (let x = 0; x < totalWidth; x += 2) {
      const grassH = 4 + Math.sin(x * 0.15) * 2 + Math.sin(x * 0.37) * 1.5;
      // Dark green grass
      g.fillStyle = '#1a3a1a';
      g.fillRect(x, 6 - grassH, 2, grassH + 2);
      // Lighter moss highlights
      if (Math.sin(x * 0.23 + 1.7) > 0.3) {
        g.fillStyle = '#2a5a2a';
        g.fillRect(x, 6 - grassH, 2, 2);
      }
      // Occasional bright tips
      if (Math.sin(x * 0.51 + 0.3) > 0.7) {
        g.fillStyle = '#3a7a3a';
        g.fillRect(x, 6 - grassH - 1, 1, 2);
      }
    }

    // ── Grass tufts (taller blades) ──
    for (let i = 0; i < 150; i++) {
      const tx = rand() * totalWidth;
      const th = 6 + rand() * 10;
      g.strokeStyle = `rgb(${25 + rand() * 40}, ${50 + rand() * 50}, ${20 + rand() * 30})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(tx, 6);
      g.lineTo(tx + (rand() - 0.5) * 6, 6 - th);
      g.stroke();
    }

    // ── Small mushrooms / flowers ──
    for (let i = 0; i < 20; i++) {
      const mx = rand() * totalWidth;
      // Tiny mushroom: stem + cap
      g.fillStyle = '#4a3528';
      g.fillRect(mx, 2, 2, 5); // stem
      g.fillStyle = rand() > 0.5 ? '#8b3030' : '#6a4a2a';
      g.fillRect(mx - 1, 0, 4, 3); // cap
    }

    // ── Bone fragments buried in soil ──
    // Skulls, ribs, femurs partially emerging from the dirt
    for (let i = 0; i < 60; i++) {
      const bx = rand() * totalWidth;
      const by = 12 + rand() * (groundDepth - 30);
      const boneType = Math.floor(rand() * 4);
      const alpha = 0.15 + rand() * 0.25;
      const boneColor = `rgba(${180 + rand() * 50}, ${170 + rand() * 40}, ${140 + rand() * 30}, ${alpha})`;
      
      g.fillStyle = boneColor;
      g.strokeStyle = `rgba(120, 110, 90, ${alpha * 0.6})`;
      g.lineWidth = 0.5;

      if (boneType === 0) {
        // Small skull shape
        g.beginPath();
        g.arc(bx, by, 3 + rand() * 2, 0, Math.PI * 2);
        g.fill();
        // Eye sockets
        g.fillStyle = `rgba(40, 30, 20, ${alpha})`;
        g.fillRect(bx - 2, by - 1, 1.5, 1.5);
        g.fillRect(bx + 0.5, by - 1, 1.5, 1.5);
      } else if (boneType === 1) {
        // Femur bone (long bone)
        const len = 8 + rand() * 12;
        const angle = rand() * Math.PI;
        g.beginPath();
        g.moveTo(bx, by);
        g.lineTo(bx + Math.cos(angle) * len, by + Math.sin(angle) * len * 0.3);
        g.lineWidth = 1.5 + rand();
        g.strokeStyle = boneColor;
        g.stroke();
        // Knobs at ends
        g.beginPath();
        g.arc(bx, by, 1.5, 0, Math.PI * 2);
        g.arc(bx + Math.cos(angle) * len, by + Math.sin(angle) * len * 0.3, 1.5, 0, Math.PI * 2);
        g.fill();
      } else if (boneType === 2) {
        // Rib cage fragment
        for (let r = 0; r < 3; r++) {
          g.beginPath();
          g.arc(bx, by + r * 3, 5 + rand() * 3, -0.8, 0.8);
          g.lineWidth = 1;
          g.strokeStyle = boneColor;
          g.stroke();
        }
      } else {
        // Scattered small bone pieces
        for (let p = 0; p < 3; p++) {
          const px = bx + (rand() - 0.5) * 8;
          const py = by + (rand() - 0.5) * 4;
          g.fillRect(px, py, 2 + rand() * 4, 1 + rand());
        }
      }
    }

    this.groundCacheCanvas = cache;
  }

  /**
   * Utility to remove a specific background color from an image (chroma keying)
   */
  makeTransparent(img, r, g, b) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    
    // We'll target the color of the first pixel (top-left) as the 'background' to remove
    const tr = data[0];
    const tg = data[1];
    const tb = data[2];

    for (let i = 0; i < data.length; i += 4) {
      // If pixel matches the background color closely, make it transparent
      if (Math.abs(data[i] - tr) < 10 && Math.abs(data[i+1] - tg) < 10 && Math.abs(data[i+2] - tb) < 10) {
        data[i + 3] = 0;
      }
    }
    
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  /**
   * Generate random skeleton decoration positions scattered across the ground.
   * Uses the last few frames of the death animation (skeleton lying down).
   */
  generateSkeletonDecorations() {
    if (!this.skeletonDieImg || this.skeletonDieImg.width <= 1) return;

    const ts = TILE_SIZE * SCALE;
    const totalWidth = this.mapWidth * ts;
    
    // Die sprite sheet: 15 frames in horizontal strip
    const sheetW = this.skeletonDieImg.width;
    const sheetH = this.skeletonDieImg.height;
    const totalFrames = 15;
    const frameW = Math.floor(sheetW / totalFrames);
    
    console.log(`[Skeleton] Sheet: ${sheetW}x${sheetH}, frameW: ${frameW}, frames: ${totalFrames}`);
    
    // Use the last 4 frames (skeleton fully collapsed on ground)
    const deadFrames = [totalFrames - 4, totalFrames - 3, totalFrames - 2, totalFrames - 1];
    
    // Seeded random for consistency
    const rng = (seed) => {
      let s = seed;
      return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
    };
    const rand = rng(1337);

    // Scatter 15-20 skeletons across the map
    const count = 15 + Math.floor(rand() * 6);
    this.skeletonDecorations = [];
    
    for (let i = 0; i < count; i++) {
      // Evenly spread across the map with some randomness
      const baseX = (i / count) * (totalWidth - 400) + 300;
      const x = baseX + (rand() - 0.5) * 200;
      const frame = deadFrames[Math.floor(rand() * deadFrames.length)];
      const flip = rand() > 0.5;
      // Keep them anchored to the ground
      const yOffset = rand() * 4;
      
      this.skeletonDecorations.push({ x, frame, frameW, frameH: sheetH, flip, yOffset });
    }
    
    // Sort by x position for consistent rendering
    this.skeletonDecorations.sort((a, b) => a.x - b.x);
    console.log(`[Skeleton] Generated ${this.skeletonDecorations.length} decorations`);
  }

  renderSkeletonDecorations(ctx) {
    if (!this.skeletonDieImg || this.skeletonDecorations.length === 0) return;

    const ts = TILE_SIZE * SCALE;
    const groundY = this.groundRow * ts;
    const drawScale = 3.0; // large enough to be clearly visible

    // Only render visible skeletons
    const camLeft = this.camera.x - 200;
    const camRight = this.camera.x + this.canvas.width + 200;

    for (const skel of this.skeletonDecorations) {
      if (skel.x < camLeft || skel.x > camRight) continue;

      const drawW = skel.frameW * drawScale;
      const drawH = skel.frameH * drawScale;

      ctx.save();
      // Position at ground level — skeletons lie ON the ground
      ctx.translate(Math.floor(skel.x), Math.floor(groundY + skel.yOffset));
      
      if (skel.flip) {
        ctx.scale(-1, 1);
      }

      // Slightly transparent for a faded/dead look
      ctx.globalAlpha = 0.75;
      ctx.drawImage(
        this.skeletonDieImg,
        skel.frame * skel.frameW, 0, skel.frameW, skel.frameH,
        -drawW / 2, -drawH + 8, drawW, drawH
      );
      ctx.globalAlpha = 1.0;
      ctx.restore();
    }
  }

  renderTilemap(ctx) {
    if (!this.groundCacheCanvas || !this.collisionTiles.length) return;

    const ts = TILE_SIZE * SCALE;
    const groundY = this.groundRow * ts;

    // Draw the pre-rendered ground strip
    const srcX = Math.max(0, Math.floor(this.camera.x));
    const srcW = Math.min(this.canvas.width, this.groundCacheCanvas.width - srcX);

    if (srcW > 0) {
      ctx.drawImage(
        this.groundCacheCanvas,
        srcX, 0, srcW, this.groundCacheCanvas.height,
        srcX, groundY - 6, srcW, this.groundCacheCanvas.height
      );
    }
    
    // Draw the floating logs dynamically
    ctx.fillStyle = '#4a2f1d';
    ctx.strokeStyle = '#2d1c11';
    ctx.lineWidth = 4;
    const startCol = Math.max(0, Math.floor(this.camera.x / ts));
    const endCol = Math.min(this.mapWidth, Math.ceil((this.camera.x + this.canvas.width) / ts));

    for (let c = startCol; c < endCol; c++) {
      for (let r = 0; r < this.groundRow; r++) {
        if (this.collisionTiles[r * this.mapWidth + c] === 2) {
          const cx = c * ts;
          const cy = r * ts;
          
          // Draw log body
          ctx.fillRect(cx, cy + ts/2, ts, ts/2);
          ctx.strokeRect(cx, cy + ts/2, ts, ts/2);
          
          // Draw bark indentations
          ctx.beginPath();
          ctx.moveTo(cx + 4, cy + ts/2 + 4);
          ctx.lineTo(cx + ts - 4, cy + ts/2 + 4);
          ctx.moveTo(cx + 10, cy + ts/2 + 12);
          ctx.lineTo(cx + ts - 10, cy + ts/2 + 12);
          ctx.strokeStyle = '#1e1008';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
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
