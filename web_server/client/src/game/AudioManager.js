/**
 * AudioManager.js
 * Handles preloading and playing of game audio effects and background music.
 * Automatically defers playback until user has interacted with the page
 * (required by browser autoplay policy).
 */

export class AudioManager {
  constructor() {
    this.sounds = {};
    this.bgm = null;
    this.sfxEnabled = true;
    this.bgmEnabled = true;
    this.userHasInteracted = false;
    this._pendingBgm = null; // { key, volume } queued before interaction
    this._audioContext = null;

    // Unlock audio on the very first user gesture
    this._unlockAudio = this._unlockAudio.bind(this);
    const events = ['click', 'touchstart', 'keydown', 'pointerdown'];
    events.forEach(evt => document.addEventListener(evt, this._unlockAudio, { once: false, capture: true }));
  }

  /** Called on first user gesture to unlock audio context */
  _unlockAudio() {
    if (this.userHasInteracted) return;
    this.userHasInteracted = true;
    console.log('[Audio] User interaction detected — audio unlocked');

    // Create and resume AudioContext to fully unlock audio on all browsers
    try {
      this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (this._audioContext.state === 'suspended') {
        this._audioContext.resume();
      }
    } catch (e) {
      // AudioContext not needed for basic Audio() usage, just helps unlock
    }

    // Remove all listeners
    const events = ['click', 'touchstart', 'keydown', 'pointerdown'];
    events.forEach(evt => document.removeEventListener(evt, this._unlockAudio, { capture: true }));

    // If BGM was queued before interaction, play it now
    if (this._pendingBgm) {
      const { key, volume } = this._pendingBgm;
      this._pendingBgm = null;
      this.playBgm(key, volume);
    }
  }

  /**
   * Preload a list of sounds.
   * @param {Object} soundMap - { key: url }
   */
  async load(soundMap) {
    const promises = Object.entries(soundMap).map(([key, url]) => {
      return new Promise((resolve) => {
        const audio = new Audio();
        audio.preload = 'auto';

        // Resolve on any of these events
        const done = () => {
          audio.removeEventListener('canplaythrough', done);
          audio.removeEventListener('loadeddata', done);
          clearTimeout(timeout);
          resolve();
        };

        audio.addEventListener('canplaythrough', done, { once: true });
        audio.addEventListener('loadeddata', done, { once: true });

        audio.onerror = () => {
          console.warn(`[Audio] Failed to load: ${url}`);
          clearTimeout(timeout);
          resolve(); // Resolve anyway so it doesn't block the game
        };

        // Timeout fallback — don't wait forever for large WAV files
        const timeout = setTimeout(() => {
          console.warn(`[Audio] Timeout loading: ${url} — using partially loaded`);
          resolve();
        }, 5000);

        this.sounds[key] = audio;
        audio.src = url; // Set src AFTER attaching listeners
      });
    });

    await Promise.all(promises);
    console.log('[Audio] All sounds loaded:', Object.keys(this.sounds).join(', '));
  }

  playSound(key, volume = 0.5) {
    if (!this.sfxEnabled || !this.userHasInteracted) return;
    const sound = this.sounds[key];
    if (sound) {
      // Clone the node to allow overlapping identical sounds
      const clone = sound.cloneNode();
      clone.volume = volume;
      clone.play().catch(() => {});
    }
  }

  playBgm(key, volume = 0.4) {
    if (!this.bgmEnabled) return;

    // If user hasn't interacted yet, queue it for later
    if (!this.userHasInteracted) {
      console.log('[Audio] BGM queued — waiting for user interaction');
      this._pendingBgm = { key, volume };
      return;
    }

    const sound = this.sounds[key];
    if (sound) {
      if (this.bgm) {
        this.bgm.pause();
        this.bgm.currentTime = 0;
      }
      this.bgm = sound;
      this.bgm.loop = true;
      this.bgm.volume = volume;
      this.bgm.play().catch((e) => {
        console.warn('[Audio] BGM play failed:', e.message);
      });
    } else {
      console.warn(`[Audio] BGM key not found: ${key}`);
    }
  }

  stopBgm() {
    this._pendingBgm = null;
    if (this.bgm) {
      this.bgm.pause();
      this.bgm.currentTime = 0;
      this.bgm = null;
    }
  }

  toggleSfx() {
    this.sfxEnabled = !this.sfxEnabled;
    return this.sfxEnabled;
  }

  toggleBgm() {
    this.bgmEnabled = !this.bgmEnabled;
    if (!this.bgmEnabled) {
      this.stopBgm();
    } else if (this.userHasInteracted) {
      // Re-enable: try to restart BGM
      this.playBgm('bgm', 0.2);
    }
    return this.bgmEnabled;
  }
}

// Singleton instance to be used across components / GameEngine
export const audioManager = new AudioManager();
