/* ================================================================
   Chord Trainer
   Vanilla JS app for drilling piano chord recall via a MIDI keyboard.
   ================================================================ */

'use strict';

/* ---------- Chord definitions ----------
   Pitch classes are 0..11, where C=0, C#=1, ... B=11.
   A triad is identified by an ordered list of root + intervals modulo 12.
   - Major triad: root, root+4, root+7
   - Minor triad: root, root+3, root+7
*/

const ROOT_VALUES = {
  C: 0, 'C#': 1, Db: 1,
  D: 2, 'D#': 3, Eb: 3,
  E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8,
  A: 9, 'A#': 10, Bb: 10, B: 11,
};

function majorTriad(rootLabel) {
  const r = ROOT_VALUES[rootLabel];
  return {
    name: `${rootLabel} major`,
    pitchClasses: new Set([r, (r + 4) % 12, (r + 7) % 12]),
  };
}

function minorTriad(rootLabel) {
  const r = ROOT_VALUES[rootLabel];
  return {
    name: `${rootLabel} minor`,
    pitchClasses: new Set([r, (r + 3) % 12, (r + 7) % 12]),
  };
}

const NATURAL_MAJOR_ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const EXTRA_MAJOR_ROOTS = ['Db', 'Eb', 'F#', 'Ab', 'Bb'];
const NATURAL_MINOR_ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const EXTRA_MINOR_ROOTS = ['C#', 'Eb', 'F#', 'G#', 'Bb'];

const POOLS = {
  naturalMajors: NATURAL_MAJOR_ROOTS.map(majorTriad),
  allMajors: [...NATURAL_MAJOR_ROOTS, ...EXTRA_MAJOR_ROOTS].map(majorTriad),
  naturalMinors: NATURAL_MINOR_ROOTS.map(minorTriad),
  allMinors: [...NATURAL_MINOR_ROOTS, ...EXTRA_MINOR_ROOTS].map(minorTriad),
  naturals: [
    ...NATURAL_MAJOR_ROOTS.map(majorTriad),
    ...NATURAL_MINOR_ROOTS.map(minorTriad),
  ],
  everything: [
    ...[...NATURAL_MAJOR_ROOTS, ...EXTRA_MAJOR_ROOTS].map(majorTriad),
    ...[...NATURAL_MINOR_ROOTS, ...EXTRA_MINOR_ROOTS].map(minorTriad),
  ],
};

/* ---------- Settings ---------- */

const DEFAULT_SETTINGS = {
  pool: 'everything',
  tempo: 90,
  timePerChord: 3,
  metronomeOn: true,
  metronomeVolume: 50,
  strictMode: false,
  dingOn: true,
};

const STORAGE_KEY = 'chord-trainer-settings-v1';

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable - ignore */
  }
}

let settings = loadSettings();

/* ---------- Metronome ----------
   Scheduling uses the Web Audio API. We run a setTimeout-based scheduler
   that looks ahead a small window and queues click sounds at exact
   AudioContext times. A separate callback fires near each beat for the
   visual update.
*/

class Metronome {
  constructor() {
    this.ctx = null;
    this.bpm = 90;
    this.volume = 0.5;
    this.enabled = true;
    this.beatsPerMeasure = 4;
    this.lookahead = 25; // ms
    this.scheduleAheadTime = 0.1; // s
    this.timerID = null;
    this.nextBeatTime = 0;
    this.beatNumber = 0;
    this.onBeat = null; // (beatNumber, timeMs)
  }

  ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  start() {
    this.ensureContext();
    this.beatNumber = 0;
    this.nextBeatTime = this.ctx.currentTime + 0.05;
    this.scheduler();
  }

  stop() {
    if (this.timerID) {
      clearTimeout(this.timerID);
      this.timerID = null;
    }
  }

  scheduler() {
    while (this.nextBeatTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleClick(this.beatNumber, this.nextBeatTime);
      const beat = this.beatNumber;
      const time = this.nextBeatTime;
      const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000);
      setTimeout(() => {
        if (this.onBeat) this.onBeat(beat, performance.now());
      }, delayMs);
      this.nextBeatTime += 60 / this.bpm;
      this.beatNumber++;
    }
    this.timerID = setTimeout(() => this.scheduler(), this.lookahead);
  }

  scheduleClick(beatNumber, time) {
    if (!this.enabled || this.volume <= 0) return;
    const isDownbeat = beatNumber % this.beatsPerMeasure === 0;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = isDownbeat ? 1000 : 700;
    osc.type = 'square';
    const peakVolume = this.volume * (isDownbeat ? 1 : 0.55);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(peakVolume, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  playDing() {
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = 1320; // E6
    osc.type = 'sine';
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.32);
  }
}

const metronome = new Metronome();

// Pause between the end of one chord and the start of the next. Asymmetric:
// on a miss the user needs time to read the "Was: X" feedback and notice
// what they missed; on a correct answer the user already knows they got it,
// so we keep the flow tight.
const PAUSE_AFTER_CORRECT_MS = 200;
const PAUSE_AFTER_INCORRECT_MS = 600;

/* ---------- ChordTrainer state machine ---------- */

class ChordTrainer {
  constructor() {
    this.state = 'idle'; // 'idle' | 'countin' | 'playing'
    this.pool = [];
    this.currentChord = null;
    this.chordStartTime = 0;
    this.chordEndTime = 0;
    this.timeoutId = null;
    this.rafId = null;
    this.playedPitchClasses = new Set();
    this.heldNotes = new Set(); // MIDI note numbers currently held, for keyboard highlight
    this.chordDurationMs = 0;
    this.detected = false;
    this.score = { correct: 0, total: 0 };
    this.stats = {}; // chordName -> { attempts, correct, totalResponseMs }
    this.startBeat = 0;
  }

  reset() {
    this.stopTimers();
    this.score = { correct: 0, total: 0 };
    this.stats = {};
    this.state = 'idle';
    this.currentChord = null;
    this.detected = false;
    this.playedPitchClasses.clear();
    this.heldNotes.clear();
    updateScoreUI();
    setChordDisplay('Ready', 'neutral');
    setFeedback('');
    setProgress(1, 'neutral');
    hideSummary();
  }

  start() {
    this.reset();
    this.pool = POOLS[settings.pool];
    if (!this.pool || this.pool.length === 0) return;

    this.state = 'countin';
    this.startBeat = -1; // unknown until first metronome beat
    setChordDisplay('4', 'countdown');
    setFeedback('Count-in...');
    setProgress(1, 'neutral');

    // Configure & start metronome
    metronome.bpm = settings.tempo;
    metronome.volume = settings.metronomeOn ? settings.metronomeVolume / 100 : 0;
    metronome.enabled = settings.metronomeOn;
    metronome.onBeat = (beatNumber) => this.handleBeat(beatNumber);
    metronome.start();
  }

  stop() {
    if (this.state === 'idle') return;
    this.stopTimers();
    metronome.stop();
    metronome.onBeat = null;
    this.state = 'idle';
    setChordDisplay('Stopped', 'neutral');
    setFeedback('');
    setProgress(0, 'neutral');
    showSummary(this.score, this.stats);
    this.heldNotes.clear();
    this.refreshKeyboardHighlight();
    clearBeatDots();
  }

  stopTimers() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  handleBeat(beatNumber) {
    flashBeatDot(beatNumber);

    if (this.state === 'countin') {
      if (this.startBeat < 0) this.startBeat = beatNumber;
      const countinPos = beatNumber - this.startBeat;
      const remaining = 4 - countinPos;
      if (remaining > 0) {
        setChordDisplay(String(remaining), 'countdown');
      } else {
        // Count-in complete, advance to playing
        this.state = 'playing';
        this.nextChord();
      }
    }
  }

  nextChord() {
    // Pick a chord from the pool, avoiding immediate repetition when possible.
    let nextChord;
    if (this.pool.length === 1) {
      nextChord = this.pool[0];
    } else {
      do {
        nextChord = this.pool[Math.floor(Math.random() * this.pool.length)];
      } while (this.currentChord && nextChord.name === this.currentChord.name);
    }

    this.currentChord = nextChord;
    this.detected = false;
    this.playedPitchClasses.clear();
    // Note: heldNotes is NOT cleared so the visual reflects what's actually down.
    this.refreshKeyboardHighlight();

    this.chordDurationMs = settings.timePerChord * 1000;
    this.chordStartTime = performance.now();
    this.chordEndTime = this.chordStartTime + this.chordDurationMs;

    setChordDisplay(this.currentChord.name, 'neutral');
    setFeedback('');
    setProgress(1, 'neutral');

    this.tickProgress();

    this.timeoutId = setTimeout(() => this.endChord(), this.chordDurationMs);
  }

  tickProgress() {
    const now = performance.now();
    const remaining = Math.max(0, this.chordEndTime - now);
    const total = this.chordDurationMs || 1;
    // Preserve the 'correct' variant once detected so the bar stays green
    // until the chord ends.
    setProgress(remaining / total, this.detected ? 'correct' : undefined);
    if (this.state === 'playing' && remaining > 0) {
      this.rafId = requestAnimationFrame(() => this.tickProgress());
    }
  }

  endChord() {
    if (this.state !== 'playing') return;
    const chord = this.currentChord;
    if (!chord) return;

    this.score.total += 1;
    const stat = this.getStat(chord.name);
    stat.attempts += 1;

    if (this.detected) {
      this.score.correct += 1;
      stat.correct += 1;
      // responseMs already recorded at detection time
      setChordDisplay(chord.name, 'correct');
      setProgress(0, 'correct');
    } else {
      setChordDisplay(chord.name, 'incorrect');
      setProgress(0, 'incorrect');
      setFeedback(`Was: ${chord.name}`);
    }

    updateScoreUI();

    const pauseMs = this.detected ? PAUSE_AFTER_CORRECT_MS : PAUSE_AFTER_INCORRECT_MS;
    this.timeoutId = setTimeout(() => {
      if (this.state === 'playing') this.nextChord();
    }, pauseMs);
  }

  getStat(name) {
    if (!this.stats[name]) {
      this.stats[name] = { attempts: 0, correct: 0, totalResponseMs: 0 };
    }
    return this.stats[name];
  }

  /* ----- MIDI input handler -----
     Called for every MIDI note-on (velocity > 0).
     We track pitch classes (note % 12) so any octave counts.
     If the current chord's three required pitch classes are all present,
     mark the answer correct. In strict mode, the played-notes set must
     match the required set exactly (no extras).
  */
  handleNoteOn(note) {
    this.heldNotes.add(note);
    this.refreshKeyboardHighlight();
    if (this.state !== 'playing' || !this.currentChord || this.detected) return;

    const pc = ((note % 12) + 12) % 12;
    this.playedPitchClasses.add(pc);

    const required = this.currentChord.pitchClasses;
    const allRequiredPresent = [...required].every(p => this.playedPitchClasses.has(p));
    if (!allRequiredPresent) return;

    if (settings.strictMode) {
      // Strict mode operates on pitch classes, not physical keys: the set of
      // pitch classes played must equal the set required by the triad. This
      // accepts octave doublings of chord tones (e.g. C3 + C4 + E4 + G4 still
      // counts as C major) but rejects any pitch class outside the triad.
      // Physical-note strictness would penalise normal two-handed voicings,
      // which isn't what a self-taught pianist needs from a practice tool.
      if (this.playedPitchClasses.size !== required.size) return;
      for (const p of this.playedPitchClasses) {
        if (!required.has(p)) return;
      }
    }

    // Mark correct
    this.detected = true;
    const responseMs = performance.now() - this.chordStartTime;
    const stat = this.getStat(this.currentChord.name);
    stat.totalResponseMs += responseMs;
    setChordDisplay(this.currentChord.name, 'correct');
    setProgress(this.getProgressFraction(), 'correct');
    setFeedback(`Correct (${(responseMs / 1000).toFixed(2)}s)`);

    if (settings.dingOn) {
      metronome.playDing();
    }
  }

  handleNoteOff(note) {
    this.heldNotes.delete(note);
    this.refreshKeyboardHighlight();
  }

  refreshKeyboardHighlight() {
    // Compute the set of pitch classes currently held across all octaves,
    // then mark on-screen keys with matching pitch class.
    const heldPCs = new Set();
    for (const n of this.heldNotes) heldPCs.add(((n % 12) + 12) % 12);
    document.querySelectorAll('.key').forEach(k => {
      const pc = parseInt(k.dataset.pc, 10);
      k.classList.toggle('active', heldPCs.has(pc));
    });
  }

  getProgressFraction() {
    const now = performance.now();
    const remaining = Math.max(0, this.chordEndTime - now);
    const total = this.chordDurationMs || 1;
    return remaining / total;
  }
}

const trainer = new ChordTrainer();

/* ---------- MIDI ---------- */

let midiAccess = null;
const connectedInputs = new Map(); // id -> MIDIInput

function isMidiSupported() {
  return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
}

function hasMidiInput() {
  return connectedInputs.size > 0;
}

async function connectMidi() {
  if (!isMidiSupported()) {
    setMidiStatus('Not supported', 'error');
    showCompatWarning();
    return;
  }
  try {
    midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    bindMidiInputs();
    midiAccess.onstatechange = () => bindMidiInputs();
  } catch (err) {
    console.error('MIDI access failed', err);
    setMidiStatus('Permission denied', 'error');
  }
}

function bindMidiInputs() {
  // Detach old
  for (const input of connectedInputs.values()) {
    input.onmidimessage = null;
  }
  connectedInputs.clear();

  for (const input of midiAccess.inputs.values()) {
    input.onmidimessage = handleMidiMessage;
    connectedInputs.set(input.id, input);
  }

  const names = [...connectedInputs.values()].map(i => i.name).filter(Boolean);
  const startBtn = document.getElementById('start');
  if (names.length === 0) {
    setMidiStatus('No devices found', 'error');
    // Permission granted but no device — disable Start until one shows up.
    startBtn.disabled = true;
  } else {
    setMidiStatus(`Connected: ${names.join(', ')}`, 'connected');
    if (trainer.state === 'idle') startBtn.disabled = false;
  }
}

function handleMidiMessage(event) {
  const [status, note, velocity] = event.data;
  const command = status & 0xf0;
  if (command === 0x90 && velocity > 0) {
    trainer.handleNoteOn(note);
  } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
    trainer.handleNoteOff(note);
  }
}

/* ---------- UI helpers ---------- */

function setChordDisplay(text, variant) {
  const el = document.getElementById('chord-name');
  el.textContent = text;
  el.classList.remove('correct', 'incorrect', 'countdown');
  if (variant === 'correct') el.classList.add('correct');
  else if (variant === 'incorrect') el.classList.add('incorrect');
  else if (variant === 'countdown') el.classList.add('countdown');
}

function setProgress(fraction, variant) {
  const el = document.getElementById('progress-fill');
  el.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  el.classList.remove('correct', 'incorrect');
  if (variant === 'correct') el.classList.add('correct');
  else if (variant === 'incorrect') el.classList.add('incorrect');
}

function setFeedback(text) {
  document.getElementById('feedback').textContent = text;
}

function setMidiStatus(text, variant) {
  const el = document.getElementById('midi-status');
  el.textContent = `MIDI: ${text}`;
  el.classList.remove('connected', 'disconnected', 'error');
  el.classList.add(variant || 'disconnected');
}

function showCompatWarning() {
  document.getElementById('compat-warning').classList.remove('hidden');
  document.getElementById('connect-midi').disabled = true;
}

function updateScoreUI() {
  document.getElementById('score-correct').textContent = trainer.score.correct;
  document.getElementById('score-total').textContent = trainer.score.total;
  const acc = trainer.score.total === 0
    ? '—'
    : `${Math.round((trainer.score.correct / trainer.score.total) * 100)}%`;
  document.getElementById('score-accuracy').textContent = acc;
}

function flashBeatDot(beatNumber) {
  const dots = document.querySelectorAll('.beat-dot');
  if (dots.length === 0) return;
  const idx = beatNumber % dots.length;
  const dot = dots[idx];
  dot.classList.remove('pulse', 'pulse-strong');
  // Force reflow so re-adding the class restarts the animation
  void dot.offsetWidth;
  dot.classList.add(idx === 0 ? 'pulse-strong' : 'pulse');
  setTimeout(() => dot.classList.remove('pulse', 'pulse-strong'), 250);
}

function clearBeatDots() {
  document.querySelectorAll('.beat-dot').forEach(d => d.classList.remove('pulse', 'pulse-strong'));
}

function showSummary(score, stats) {
  const summary = document.getElementById('summary');
  const content = document.getElementById('summary-content');
  if (score.total === 0) {
    summary.classList.add('hidden');
    return;
  }
  const accuracy = Math.round((score.correct / score.total) * 100);
  const rows = Object.entries(stats)
    .map(([name, s]) => ({
      name,
      attempts: s.attempts,
      correct: s.correct,
      acc: s.attempts ? Math.round((s.correct / s.attempts) * 100) : 0,
      avgMs: s.correct ? Math.round(s.totalResponseMs / s.correct) : null,
    }))
    .sort((a, b) => a.acc - b.acc || b.attempts - a.attempts);

  // Build with the DOM API rather than innerHTML so any future change to
  // the data source (e.g. user-named chord pools) cannot inject markup.
  content.replaceChildren(
    buildSummaryStats(score.correct, score.total, accuracy),
    buildSummaryTable(rows),
  );
  summary.classList.remove('hidden');
}

function buildSummaryStats(correct, total, accuracy) {
  const wrap = el('div', 'summary-stats');
  wrap.append(
    statBlock('Score', `${correct} / ${total}`),
    statBlock('Accuracy', `${accuracy}%`),
  );
  return wrap;
}

function statBlock(label, value) {
  const div = el('div');
  div.append(el('span', null, label), el('strong', null, value));
  return div;
}

function buildSummaryTable(rows) {
  const table = el('table', 'summary-table');
  const thead = el('thead');
  const headerRow = el('tr');
  for (const h of ['Chord', 'Correct', 'Accuracy', 'Avg response']) {
    headerRow.append(el('th', null, h));
  }
  thead.append(headerRow);

  const tbody = el('tbody');
  for (const r of rows) {
    const tr = el('tr');
    tr.append(
      el('td', null, r.name),
      el('td', null, `${r.correct} / ${r.attempts}`),
      el('td', null, `${r.acc}%`),
      el('td', null, r.avgMs == null ? '—' : `${(r.avgMs / 1000).toFixed(2)}s`),
    );
    tbody.append(tr);
  }

  table.append(thead, tbody);
  return table;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function hideSummary() {
  document.getElementById('summary').classList.add('hidden');
}

/* ---------- On-screen keyboard ---------- */

const KEYBOARD_OCTAVES = 2;
const KEYBOARD_START_OCTAVE = 4;

function renderKeyboard() {
  const container = document.getElementById('keyboard');
  container.innerHTML = '';

  const whiteSemitones = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
  const blackSemitones = [1, 3, 6, 8, 10];       // C# D# F# G# A#
  const totalWhite = whiteSemitones.length * KEYBOARD_OCTAVES;

  // White keys
  for (let octIdx = 0; octIdx < KEYBOARD_OCTAVES; octIdx++) {
    for (let i = 0; i < whiteSemitones.length; i++) {
      const semitone = whiteSemitones[i];
      const note = (KEYBOARD_START_OCTAVE + 1 + octIdx) * 12 + semitone;
      const key = document.createElement('div');
      key.className = 'key white';
      key.dataset.note = note;
      key.dataset.pc = semitone;
      container.appendChild(key);
    }
  }

  // Black keys positioned by percentage. Within each octave the black keys
  // sit between white keys 1-2, 2-3, 4-5, 5-6, 6-7 (1-indexed).
  const blackPositions = [1, 2, 4, 5, 6]; // gaps after white index 0,1,3,4,5
  const whiteWidthPct = 100 / totalWhite;
  for (let octIdx = 0; octIdx < KEYBOARD_OCTAVES; octIdx++) {
    for (let i = 0; i < blackSemitones.length; i++) {
      const semitone = blackSemitones[i];
      const gap = blackPositions[i];
      const whiteIdx = octIdx * whiteSemitones.length + gap;
      const note = (KEYBOARD_START_OCTAVE + 1 + octIdx) * 12 + semitone;
      const key = document.createElement('div');
      key.className = 'key black';
      key.dataset.note = note;
      key.dataset.pc = semitone;
      // Center black key on the boundary between two white keys
      key.style.left = `calc(${whiteIdx * whiteWidthPct}% - 2.5%)`;
      container.appendChild(key);
    }
  }
}

/* ---------- Settings UI binding ---------- */

function applySettingsToUI() {
  document.getElementById('pool').value = settings.pool;
  document.getElementById('tempo').value = settings.tempo;
  document.getElementById('tempo-value').textContent = settings.tempo;
  document.getElementById('time-per-chord').value = settings.timePerChord;
  document.getElementById('time-per-chord-value').textContent = settings.timePerChord.toFixed(1);
  document.getElementById('metronome-on').checked = settings.metronomeOn;
  document.getElementById('metronome-volume').value = settings.metronomeVolume;
  document.getElementById('volume-value').textContent = settings.metronomeVolume;
  document.getElementById('strict-mode').checked = settings.strictMode;
  document.getElementById('ding-on').checked = settings.dingOn;
}

function bindSettingsHandlers() {
  document.getElementById('pool').addEventListener('change', e => {
    settings.pool = e.target.value;
    saveSettings(settings);
  });

  // Range sliders fire 'input' continuously as the user drags. We update
  // the live UI label and any state the user can hear (metronome tempo /
  // volume) immediately, but defer the localStorage write to the 'change'
  // event so we get one write per drag instead of dozens of synchronous
  // I/O calls.
  bindRangeSetting('tempo', value => {
    settings.tempo = parseInt(value, 10);
    document.getElementById('tempo-value').textContent = settings.tempo;
    metronome.bpm = settings.tempo;
  });

  bindRangeSetting('time-per-chord', value => {
    settings.timePerChord = parseFloat(value);
    document.getElementById('time-per-chord-value').textContent = settings.timePerChord.toFixed(1);
  });

  bindRangeSetting('metronome-volume', value => {
    settings.metronomeVolume = parseInt(value, 10);
    document.getElementById('volume-value').textContent = settings.metronomeVolume;
    metronome.volume = settings.metronomeOn ? settings.metronomeVolume / 100 : 0;
  });

  document.getElementById('metronome-on').addEventListener('change', e => {
    settings.metronomeOn = e.target.checked;
    metronome.enabled = settings.metronomeOn;
    metronome.volume = settings.metronomeOn ? settings.metronomeVolume / 100 : 0;
    saveSettings(settings);
  });
  document.getElementById('strict-mode').addEventListener('change', e => {
    settings.strictMode = e.target.checked;
    saveSettings(settings);
  });
  document.getElementById('ding-on').addEventListener('change', e => {
    settings.dingOn = e.target.checked;
    saveSettings(settings);
  });
}

function bindRangeSetting(id, applyValue) {
  const input = document.getElementById(id);
  input.addEventListener('input', e => applyValue(e.target.value));
  input.addEventListener('change', () => saveSettings(settings));
}

function bindControlHandlers() {
  document.getElementById('connect-midi').addEventListener('click', connectMidi);

  document.getElementById('start').addEventListener('click', () => {
    document.getElementById('start').disabled = true;
    document.getElementById('stop').disabled = false;
    trainer.start();
  });

  document.getElementById('stop').addEventListener('click', () => {
    document.getElementById('start').disabled = !hasMidiInput();
    document.getElementById('stop').disabled = true;
    trainer.stop();
  });

  document.getElementById('reset').addEventListener('click', () => {
    if (trainer.state !== 'idle') {
      // Stop first
      trainer.stop();
      document.getElementById('start').disabled = !hasMidiInput();
      document.getElementById('stop').disabled = true;
    }
    trainer.reset();
  });
}

/* ---------- Init ---------- */

function init() {
  applySettingsToUI();
  bindSettingsHandlers();
  bindControlHandlers();
  renderKeyboard();

  if (!isMidiSupported()) {
    showCompatWarning();
    setMidiStatus('Not supported', 'error');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
