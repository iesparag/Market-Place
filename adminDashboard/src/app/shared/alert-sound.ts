/**
 * A short "ding" via the Web Audio API — no asset file needed, works in any modern
 * browser. Used for events that need to grab attention even if the admin isn't looking
 * at the screen (task assigned/unassigned/offered — see SocketService).
 */
export function playAlertBeep(): void {
  try {
    const AudioCtxCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtxCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // Browsers block audio before any user interaction on the page — not worth
    // surfacing an error for a missed notification sound.
  }
}
