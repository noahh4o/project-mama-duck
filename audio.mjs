const ENEMY_CUES = {
  fox: { arrival: [260, 150, 0.14, 'triangle'], attack: [165, 78, 0.18, 'sawtooth'] },
  raccoon: { arrival: [510, 330, 0.07, 'square'], attack: [390, 120, 0.11, 'square'] },
  blueJay: { arrival: [720, 1160, 0.09, 'triangle'], attack: [1150, 280, 0.23, 'triangle'] },
  goose: { arrival: [360, 290, 0.17, 'square'], attack: [280, 170, 0.24, 'sawtooth'] },
  alligator: { arrival: [105, 72, 0.24, 'triangle'], attack: [210, 46, 0.2, 'sawtooth'] },
};

const LEAD = [
  76, 79, 81, 79, 76, 74, 72, null,
  72, 76, 79, 76, 74, 72, 69, null,
  74, 77, 81, 84, 81, 77, 74, null,
  71, 74, 79, 77, 74, 71, 74, null,
];
const BASS = [48, 55, 52, 55, 45, 52, 48, 52, 50, 57, 53, 57, 43, 50, 47, 50];
const ENVELOPE_FLOOR = 0.0001;

function makeMusic(context) {
  const beat = Math.round(context.sampleRate * 60 / 118);
  const loop = context.createBuffer(1, beat * 16, context.sampleRate);
  const samples = loop.getChannelData(0);

  function writeNote(midi, start, length, level, pulse) {
    if (midi === null) return;
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    for (let i = 0; i < length; i++) {
      const phase = (i * frequency / context.sampleRate) % 1;
      const wave = pulse ? (phase < 0.25 ? 0.75 : -0.25) : 1 - 4 * Math.abs(phase - 0.5);
      const attack = Math.min(1, i / (context.sampleRate * 0.008));
      const release = 1 - i / length;
      samples[start + i] += wave * level * attack * release ** 2;
    }
  }

  LEAD.forEach((note, step) => writeNote(note, Math.floor(step * beat / 2), Math.floor(beat * 0.42), 0.055, true));
  BASS.forEach((note, step) => writeNote(note, step * beat, Math.floor(beat * 0.85), 0.065, false));
  return loop;
}

export function createGameAudio() {
  const seenEnemies = new WeakMap();
  let meteorPhase;
  let lightningPhase;
  let context;
  let master;
  let music;
  let musicBuffer;
  let musicStartedAt;
  let musicOffset = 0;
  let noiseBuffer;
  let muted = false;
  let musicWanted = false;

  function updateMusic() {
    if (context && musicWanted && !muted) {
      if (music) return;
      musicBuffer ??= makeMusic(context);
      music = context.createBufferSource();
      music.buffer = musicBuffer;
      music.loop = true;
      music.connect(master);
      musicStartedAt = context.currentTime;
      music.start(musicStartedAt, musicOffset);
    } else if (music) {
      const previous = music;
      musicOffset = (musicOffset + context.currentTime - musicStartedAt) % musicBuffer.duration;
      previous.onended = () => previous.disconnect();
      previous.stop();
      music = undefined;
    }
  }

  function unlock() {
    if (!context) {
      const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Audio) return;
      try {
        context = new Audio();
      } catch {
        return;
      }
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.7;
      master.connect(context.destination);
    }
    if (context.state !== 'running') void context.resume().catch(() => {});
    updateMusic();
  }

  function playSource(source, output, duration, level, delay) {
    const start = context.currentTime + delay;
    const gain = context.createGain();
    gain.gain.setValueAtTime(ENVELOPE_FLOOR, start);
    gain.gain.exponentialRampToValueAtTime(level, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(ENVELOPE_FLOOR, start + duration);
    output.connect(gain).connect(master);
    source.onended = () => {
      source.disconnect();
      if (output !== source) output.disconnect();
      gain.disconnect();
    };
    source.start(start);
    source.stop(start + duration);
    return start;
  }

  function tone([from, to, duration, wave], level, delay = 0) {
    if (muted || context?.state !== 'running') return;
    const oscillator = context.createOscillator();
    oscillator.type = wave;
    const start = playSource(oscillator, oscillator, duration, level, delay);
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
  }

  function noise(duration, cutoff, level, delay = 0) {
    if (muted || context?.state !== 'running') return;
    if (!noiseBuffer) {
      noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const samples = noiseBuffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.frequency.value = cutoff;
    source.connect(filter);
    playSource(source, filter, duration, level, delay);
  }

  function syncArena(arena, width) {
    if (context?.state !== 'running') return;
    for (const enemy of arena.enemies) {
      const cue = ENEMY_CUES[enemy.type];
      if (!cue || enemy.x >= width) continue;
      const previous = seenEnemies.get(enemy);
      if (!previous) tone(cue.arrival, 0.085);
      if (enemy.hitPause > (previous?.hitPause ?? 0)) {
        tone(cue.attack, 0.14);
        noise(0.1, 650, 0.09);
      } else if (enemy.phase === 'swoop' && previous?.phase !== 'swoop') {
        tone(cue.attack, 0.09);
      }
      seenEnemies.set(enemy, { hitPause: enemy.hitPause, phase: enemy.phase });
    }

    if (arena.lightning?.phase !== lightningPhase) {
      lightningPhase = arena.lightning?.phase;
      if (lightningPhase === 'warning') tone([920, 1420, 0.18, 'triangle'], 0.08);
      if (lightningPhase === 'strike') {
        noise(0.16, 5200, 0.28);
        noise(0.5, 320, 0.26, 0.055);
        tone([150, 54, 0.3, 'triangle'], 0.15);
      }
    }
    if (arena.meteor?.phase !== meteorPhase) {
      meteorPhase = arena.meteor?.phase;
      if (meteorPhase === 'approach') {
        tone([480, 110, 0.62, 'sawtooth'], 0.13);
        noise(0.62, 1800, 0.16);
      }
      if (meteorPhase === 'impact') {
        tone([120, 34, 0.58, 'triangle'], 0.32);
        noise(0.56, 750, 0.38);
        noise(0.23, 280, 0.2, 0.14);
      }
    }
  }

  return {
    unlock,
    syncArena,
    setMusic(playing) {
      if (musicWanted === playing) return;
      musicWanted = playing;
      updateMusic();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.7, context.currentTime, 0.015);
      updateMusic();
    },
  };
}
