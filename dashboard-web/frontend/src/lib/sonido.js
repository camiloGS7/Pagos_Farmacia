/**
 * Un "ding" corto al entrar un pago, sintetizado con Web Audio: no hace falta
 * un archivo de sonido. Los navegadores no dejan sonar nada hasta que la
 * persona toca la pagina una vez; por eso el contexto se prepara con el primer
 * toque y, si nunca hubo uno, el aviso simplemente no suena.
 */

let contexto = null;

function preparar() {
  if (contexto) return contexto;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  contexto = new Ctx();
  return contexto;
}

if (typeof window !== "undefined") {
  const desbloquear = () => {
    preparar()?.resume?.();
    window.removeEventListener("pointerdown", desbloquear);
    window.removeEventListener("keydown", desbloquear);
  };
  window.addEventListener("pointerdown", desbloquear);
  window.addEventListener("keydown", desbloquear);
}

export function sonarPago() {
  const ctx = contexto;
  if (!ctx || ctx.state !== "running") return;
  const inicio = ctx.currentTime;
  // Dos notas ascendentes (mi y la), suaves y cortas.
  [659.25, 880].forEach((frecuencia, i) => {
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frecuencia;
    const t = inicio + i * 0.12;
    vol.gain.setValueAtTime(0.0001, t);
    vol.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    vol.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(vol).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  });
  if (navigator.vibrate) navigator.vibrate(60);
}
