/* Short synthesized effects. No files to fetch and no audio before player input. */
(() => {
  'use strict';
  const tones = [206, 268, 354, 300];
  const cues = {
    start: [
      {pitch: 330, end: 318, volume: .15, length: .10},
      {pitch: 494, end: 475, volume: .14, length: .15, delay: .047},
      {pitch: 988, end: 970, volume: .027, length: .09, delay: .047},
    ],
    spawn: [
      {pitch: 430, end: 590, volume: .077, length: .12, wave: 'triangle'},
      {pitch: 890, end: 820, volume: .034, length: .13, delay: .03},
    ],
    impact: [
      {pitch: 165, end: 53, volume: .33, length: .23},
      {pitch: 315, end: 109, volume: .12, length: .12, wave: 'triangle'},
      {noise: true, pitch: 1720, end: 660, volume: .25, length: .115},
    ],
    charge: [
      {pitch: 229, end: 85, volume: .15, length: .12, wave: 'triangle'},
      {noise: true, pitch: 1900, end: 700, volume: .17, length: .090},
      {pitch: 142, end: 455, volume: .09, length: .22, delay: .05, wave: 'triangle'},
    ],
    blast: [
      {pitch: 142, end: 46, volume: .38, length: .36},
      {pitch: 341, end: 75, volume: .14, length: .17, wave: 'triangle'},
      {noise: true, pitch: 1880, end: 390, volume: .36, length: .32},
      {noise: true, pitch: 3500, end: 1600, volume: .15, length: .063},
    ],
    record: [
      {pitch: 392, end: 392, volume: .09, length: .16, delay: .14},
      {pitch: 523, end: 523, volume: .09, length: .17, delay: .19},
      {pitch: 659, end: 659, volume: .09, length: .20, delay: .24},
    ],
  };

  function createMixer(context, volume = 1) {
    const output = context.createGain();
    output.gain.value = .64;
    const master = context.createGain();
    master.gain.value = volume;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = .004;
    compressor.release.value = .10;
    output.connect(compressor);
    compressor.connect(master);
    master.connect(context.destination);

    // Each noise layer uses a fresh slice so rapid impacts do not sound identical.
    const noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const samples = noise.getChannelData(0);
    let noiseSeed = 9217;
    for (let i = 0; i < samples.length; i++) {
      noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) >>> 0;
      samples[i] = noiseSeed / 2 ** 31 - 1;
    }
    let noiseOffset = 0;
    const active = new Map();
    let lastBounce = -Infinity;

    function voice(notes, pan, when) {
      const channel = context.createStereoPanner?.() || context.createGain();
      if (channel.pan) channel.pan.value = pan;
      channel.connect(output);
      let remaining = notes.length;

      for (const note of notes) {
        const start = when + (note.delay || 0);
        const finish = start + note.length;
        const envelope = context.createGain();
        envelope.gain.value = 0;
        envelope.gain.setValueAtTime(.0001, start);
        envelope.gain.exponentialRampToValueAtTime(note.volume, start + .006);
        envelope.gain.exponentialRampToValueAtTime(.0001, finish);
        envelope.connect(channel);

        const source = note.noise ? context.createBufferSource() : context.createOscillator();
        let filter;
        if (note.noise) {
          source.buffer = noise;
          filter = context.createBiquadFilter();
          filter.type = 'bandpass';
          filter.Q.value = .75;
          source.connect(filter);
          filter.connect(envelope);
        } else {
          source.type = note.wave || 'sine';
          source.connect(envelope);
        }
        const frequency = filter ? filter.frequency : source.frequency;
        frequency.setValueAtTime(note.pitch, start);
        frequency.exponentialRampToValueAtTime(note.end, finish);
        active.set(source, envelope.gain);
        source.onended = () => {
          active.delete(source);
          source.disconnect();
          filter?.disconnect();
          envelope.disconnect();
          if (--remaining === 0) channel.disconnect();
        };
        if (note.noise) {
          source.start(start, noiseOffset);
          noiseOffset = (noiseOffset + .139) % .5;
        }
        else source.start(start);
        source.stop(finish);
      }
    }

    function play(name, pan = 0, when = context.currentTime) {
      voice(cues[name], pan, when);
    }

    function bounce(type, speed, pan, wall, when = context.currentTime) {
      if (when - lastBounce < .075) return;
      lastBounce = when;
      const force = Math.min(speed / 6, 1);
      const pitch = (wall ? 151 : tones[type]) * (.92 + force * .16);
      const volume = .048 + force * .102;
      voice([
        {pitch, end: pitch * .59, volume, length: wall ? .112 : .079, wave: type % 2 ? 'triangle' : 'sine'},
        {pitch: pitch * 2.08, end: pitch * 1.41, volume: volume * .29, length: .049},
        {noise: true, pitch: wall ? 910 : 1640, end: wall ? 470 : 950, volume: volume * .48, length: .036},
      ], pan, when);
    }

    function silence() {
      const now = context.currentTime;
      for (const [source, gain] of active) {
        if (gain.cancelAndHoldAtTime) {
          gain.cancelAndHoldAtTime(now);
          gain.linearRampToValueAtTime(0, now + .012);
        }
        source.stop(now + .012);
      }
      active.clear();
      lastBounce = -Infinity;
    }

    function setVolume(value) {
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(value, now, .012);
    }

    return {play, bounce, silence, setVolume};
  }

  function create() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    let context, mixer, pendingStart;
    let enabled = true;
    let volume = 1;
    let unavailable = !AudioContext;
    const audible = () => enabled && volume > 0 && !unavailable;
    const ready = () => audible() && mixer && context.state === 'running';

    function flushStart() {
      if (!ready() || pendingStart === undefined) return;
      if (performance.now() - pendingStart < 350) mixer.play('start');
      pendingStart = undefined;
    }
    function unlock() {
      if (!audible()) return;
      if (ready()) { flushStart(); return; }
      if (navigator.userActivation?.isActive === false) return;
      if (!context) {
        try {
          context = new AudioContext({latencyHint: 'interactive'});
          mixer = createMixer(context, volume);
        } catch {
          unavailable = true;
          return;
        }
      }
      context.resume().then(flushStart, () => {});
    }
    function silence() {
      pendingStart = undefined;
      mixer?.silence();
    }
    function setEnabled(value) {
      enabled = value;
      if (!value) silence();
    }
    function setVolume(value) {
      volume = value;
      mixer?.setVolume(value);
      if (value === 0) silence();
    }
    return {
      unlock, setEnabled, setVolume, silence,
      play(name, pan = 0) {
        if (ready()) mixer.play(name, pan);
        else if (audible() && name === 'start') pendingStart = performance.now();
      },
      bounce(type, speed, pan, wall) {
        if (ready()) mixer.bounce(type, speed, pan, wall);
      },
    };
  }

  window.BounceAudio = {create, createMixer};
})();
