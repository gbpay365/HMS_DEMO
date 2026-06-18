/**
 * Lobby chime + bilingual TTS when a patient is called.
 */
let audioUnlocked = false;

export function unlockCallQueueAudio() {
  audioUnlocked = true;
}

function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch (_) {
    /* no audio */
  }
}

function speakLine(text, lang) {
  if (!text || typeof window.speechSynthesis === 'undefined') return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'fr' ? 'fr-FR' : 'en-US';
    u.rate = 0.92;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (_) {
    /* TTS unavailable */
  }
}

/**
 * @param {object} event patient_called payload
 * @param {{ chimeEnabled?: boolean, ttsEnabled?: boolean }} opts
 */
export function announcePatientCalled(event, opts = {}) {
  const chimeOn = opts.chimeEnabled !== false;
  const ttsOn = opts.ttsEnabled !== false;
  if (!audioUnlocked && typeof window !== 'undefined') {
    unlockCallQueueAudio();
  }
  if (chimeOn) playChime();
  if (!ttsOn) return;
  const en = event.ttsEn || '';
  const fr = event.ttsFr || '';
  if (en) speakLine(en, 'en');
  if (fr) {
    setTimeout(() => speakLine(fr, 'fr'), en ? 2800 : 400);
  }
}
