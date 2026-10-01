// SafeLink Sound System (Web Audio API Synthesizer - 100% self-contained)
const SafeLinkAudio = {
  ctx: null,
  enabled: true,

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  },

  toggleSound() {
    this.enabled = !this.enabled;
    return this.enabled;
  },

  // Soft modern tap / click
  playClick() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(650, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch (e) {
      console.warn("Audio feedback error:", e);
    }
  },

  // Uplifting chime when help is confirmed or request accepted
  playSuccess() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.08);
        gain.gain.setValueAtTime(0.12, this.ctx.currentTime + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + idx * 0.08 + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(this.ctx.currentTime + idx * 0.08);
        osc.stop(this.ctx.currentTime + idx * 0.08 + 0.25);
      });
    } catch (e) {
      console.warn("Audio feedback error:", e);
    }
  },

  // Attention tone for incoming helper alert
  playAlert() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.setValueAtTime(660, t + 0.15);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.35);
    } catch (e) {
      console.warn("Audio feedback error:", e);
    }
  },

  // Urgent but controlled SOS pulse sound
  playSOS() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      [0, 0.2, 0.4].forEach((delay) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(900, t + delay);
        osc.frequency.exponentialRampToValueAtTime(450, t + delay + 0.12);
        gain.gain.setValueAtTime(0.18, t + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.15);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t + delay);
        osc.stop(t + delay + 0.15);
      });
    } catch (e) {
      console.warn("Audio feedback error:", e);
    }
  },

  // Telephone Ringback Tone (Realistic calling sound)
  ringInterval: null,
  playRingtone() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      this.stopRingtone();

      const playBurst = () => {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        // Dual-frequency US/EU telephone ring: 440Hz + 480Hz
        [440, 480].forEach(freq => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.08, t);
          gain.gain.setValueAtTime(0.08, t + 1.2);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 1.3);
        });
      };

      playBurst();
      this.ringInterval = setInterval(playBurst, 3000);
    } catch (e) {
      console.warn("Ringtone error:", e);
    }
  },

  stopRingtone() {
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
  },

  // Loud Acoustic Personal Defense Siren (Wailing alarm)
  sirenInterval: null,
  sirenOsc: null,
  sirenGain: null,
  playSiren() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      this.stopSiren();

      this.sirenOsc = this.ctx.createOscillator();
      this.sirenGain = this.ctx.createGain();
      this.sirenOsc.type = "sawtooth";
      this.sirenGain.gain.setValueAtTime(0.2, this.ctx.currentTime);

      let up = true;
      const modulate = () => {
        if (!this.ctx || !this.sirenOsc) return;
        const now = this.ctx.currentTime;
        const targetFreq = up ? 1200 : 650;
        this.sirenOsc.frequency.linearRampToValueAtTime(targetFreq, now + 0.35);
        up = !up;
      };

      modulate();
      this.sirenInterval = setInterval(modulate, 360);

      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.ctx.destination);
      this.sirenOsc.start();
    } catch (e) {
      console.warn("Siren error:", e);
    }
  },

  stopSiren() {
    if (this.sirenInterval) {
      clearInterval(this.sirenInterval);
      this.sirenInterval = null;
    }
    if (this.sirenOsc) {
      try {
        this.sirenOsc.stop();
        this.sirenOsc.disconnect();
      } catch (e) {}
      this.sirenOsc = null;
    }
    if (this.sirenGain) {
      try {
        this.sirenGain.disconnect();
      } catch (e) {}
      this.sirenGain = null;
    }
  }
};

window.SafeLinkAudio = SafeLinkAudio;
