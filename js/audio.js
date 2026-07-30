/* Sound and voice. Both weigh nothing, deliberately. (D67)

   Effects are SYNTHESISED — an oscillator and a gain envelope, not six audio
   files costing 60-100 KB and six precache entries. The voice READS THE SCREEN
   rather than a recorded script, because recording 110 lessons freezes the
   content: every prose edit would silently invalidate a clip and the voice
   would start saying things the page does not. readStage() walks the rendered
   DOM, so no stage renderer knows audio exists. No music, on purpose. */

import { progress } from "./state.js";
import { prose } from "./level.js";

/* ------------------------------------------------------------------ effects */

/* Hz, played in sequence; `d` is per-note seconds. The wrong-answer sound is
   NOT a buzzer — two soft descending notes at the lowest gain here. A punishing
   error tone teaches a five-year-old to stop guessing, which is exactly what
   predict-first exists to make them do. */
const TONES = {
  pick:    { f: [494],                 d: 0.05, g: 0.16, type: "triangle" },
  drop:    { f: [262, 196],            d: 0.09, g: 0.20, type: "sine" },
  right:   { f: [523, 659, 784],       d: 0.09, g: 0.18, type: "sine" },
  wrong:   { f: [349, 294],            d: 0.14, g: 0.10, type: "sine" },
  collect: { f: [659, 988],            d: 0.09, g: 0.18, type: "triangle" },
  badge:   { f: [523, 659, 784, 1047], d: 0.10, g: 0.20, type: "triangle" },
};

let audio;
const soundOn = () => (progress.prefs?.sound ?? "on") !== "off";

/** Fire and forget. Silent if sound is off or Web Audio is unavailable, and
    never throws — a failed sound must not take a lesson down with it. */
export function sfx(name) {
  const t = TONES[name];
  if (!t || !soundOn()) return;
  try {
    audio ??= new (window.AudioContext ?? window.webkitAudioContext)();
    // Starts suspended per autoplay policy; every call site is inside a gesture.
    if (audio.state === "suspended") audio.resume();
    t.f.forEach((hz, i) => {
      const at = audio.currentTime + i * t.d * 0.72;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = t.type;
      osc.frequency.value = hz;
      // Ramped, never switched: a gain that jumps clicks at the discontinuity.
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(t.g, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + t.d);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + t.d + 0.02);
    });
  } catch { /* no audio on this device: the visual channel already carries it */ }
}

/* -------------------------------------------------------------------- voice */

const synth = window.speechSynthesis;

/** Default derived from the PROSE dial, not fixed: at level 1 the child is five
    and often cannot read the lesson at all, so narration is what makes that
    level work. Above it Mayer's redundancy principle applies — narration plus
    the same words on screen is worse than either — so it waits to be asked. */
export const voiceMode = () =>
  progress.prefs?.voice ?? (prose() === 1 ? "auto" : "ask");

/* Slower for the youngest reader, and slightly above default for L4, which is
   reading to save time rather than to decode. */
const RATE = { 1: 0.82, 2: 0.92, 3: 1, 4: 1.06 };

let voice = null;
function chooseVoice() {
  const all = synth?.getVoices?.() ?? [];
  if (!all.length) return null;                    // populates async; try again later
  const en = all.filter((v) => /^en([-_]|$)/i.test(v.lang));
  const pool = en.length ? en : all;
  /* Warm, female, unhurried, by platform. A specific voice cannot be
     guaranteed — this is a preference over whatever the OS installed, and the
     honest limit of the zero-byte approach. */
  for (const re of [/samantha/i, /\bsonia\b/i, /\blibby\b/i, /\baria\b/i, /\bjenny\b/i,
                    /google uk english female/i, /google us english/i, /\bzira\b/i, /female/i]) {
    const hit = pool.find((v) => re.test(v.name));
    if (hit) return hit;
  }
  return pool.find((v) => v.default) ?? pool[0];
}
/* getVoices() is empty until the platform has loaded them, and the very first
   stage of the very first lesson at level 1 is exactly when narration matters
   most — so a call made before they arrive is held rather than dropped. */
let pending = null;
synth?.addEventListener?.("voiceschanged", () => {
  voice = chooseVoice();
  if (pending && voice) { const held = pending; pending = null; speak(...held); }
});

export const canSpeak = () => !!synth;
export const speaking = () => !!synth && (synth.speaking || synth.pending);

export function stopSpeaking() { pending = null; synth?.cancel(); }

/* Chrome truncates an utterance at about fifteen seconds, so text is queued a
   sentence at a time — which also gives the synthesiser its prosody breaks. */
function chunk(text) {
  const out = [];
  for (const piece of text.split(/(?<=[.!?])\s+/)) {
    if (!out.length || (out.at(-1) + " " + piece).length > 180) out.push(piece);
    else out[out.length - 1] += " " + piece;
  }
  return out.filter((s) => s.trim());
}

/** `done` fires when the LAST chunk finishes, so a caller's stop button can
    return to its resting state without polling for it. */
export function speak(text, done) {
  if (!synth || !text?.trim()) return false;
  synth.cancel();
  voice ??= chooseVoice();
  // Voices not in yet: hold it. True, because audio is coming and the caller's
  // stop control has to be showing before it does.
  if (!voice) { pending = [text, done]; return true; }
  const parts = chunk(text);
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part);
    if (voice) u.voice = voice;
    u.rate = RATE[prose()] ?? 1;
    u.pitch = 1.04;
    if (i === parts.length - 1) u.onend = () => done?.();
    synth.speak(u);
  });
  return parts.length > 0;
}

/* A stage's prose in on-screen order. NOT textContent of the whole stage: that
   reads out button labels, the progress bar, and the screen-reader live regions
   — and a live region read aloud is the same sentence twice. Questions come
   from the attribute, so the components expose nothing. */
const READ = ".stage-kicker, .stage-hook, .stage-name, .stage-lead, .stage-sub,"
  + " .stage-note, .stage-caption, .stage-after, .stage-said, [data-question]";

export function proseOf(root) {
  const said = [];
  for (const node of root?.querySelectorAll?.(READ) ?? []) {
    if (node.closest(".sr-only")) continue;
    if (node.dataset?.question) {
      said.push(node.dataset.question);
      // The options are the question. A child who cannot read cannot choose.
      if (node.dataset.options) said.push(node.dataset.options.split("|").join(". "));
    } else said.push(node.textContent.trim());
  }
  return said.filter(Boolean).join(". ").replace(/\.\.+/g, ".");
}

/** Read a rendered stage aloud. Returns false if there was nothing to read. */
export const readStage = (root, done) => speak(proseOf(root), done);
