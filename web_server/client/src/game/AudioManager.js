/**
 * AudioManager.js
 * Handles preloading and playing of game audio effects and background music.
 */

export class AudioManager {
  constructor() {
    this.sounds = {};
    this.bgm = null;
    this.sfxEnabled = true;
    this.bgmEnabled = true;
  }

  /**
   * Preload a list of sounds.
   * @param {Object} soundMap - { k, v } where v is URL
   */
  async load(soundMap) {
    const promises = Object.entries(soundMap).map(([key, url]) => {
      return new Promise((resolve) => {
        const audio = new Audio(url);
        audio.preload = 'auto';
        audio.oncanplaythrough = () => resolve();
        audio.onerror = () => {
          console.warn(`[Audio] Failed to load: ${url}`);
          resolve(); // Resolve anyway so it doesn't block the game
        };
        this.sounds[key] = audio;
      });
    });

    await Promise.all(promises);
  }

  playSound(key, volume = 0.5) {
    if (!this.sfxEnabled) return;
    const sound = this.sounds[key];
    if (sound) {
      // Clone the node to allow overlapping identical sounds
      const clone = sound.cloneNode();
      clone.volume = volume;
      clone.play().catch(e => console.warn('[Audio] Auto-play blocked:', e));
    }
  }

  playBgm(key, volume = 0.4) {
    if (!this.bgmEnabled) return;
    const sound = this.sounds[key];
    if (sound) {
      if (this.bgm) {
        this.bgm.pause();
        this.bgm.currentTime = 0;
      }
      this.bgm = sound;
      this.bgm.loop = true;
      this.bgm.volume = volume;
      this.bgm.play().catch(e => console.warn('[Audio] Auto-play blocked:', e));
    }
  }

  stopBgm() {
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
    if (!this.bgmEnabled) this.stopBgm();
    return this.bgmEnabled;
  }
}

// Singleton instance to be used across components / GameEngine
export const audioManager = new AudioManager();
