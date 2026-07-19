/* ===========================================================
   Buon compleanno Andrea! 🎂
   Flusso:
   1. la torta si costruisce (animazione CSS)
   2. "Tocca per iniziare" → parte l'AUDIO (file song.mp3)
   3. le parole (sopra la torta) compaiono riga per riga
   4. a fine testo → compare "Soffia!": tap o soffio nel microfono
   5. coriandoli + messaggio di auguri
   =========================================================== */

const cake = document.getElementById("cake");
const candles = Array.from(document.querySelectorAll(".candle"));
const stageCake = document.getElementById("stage-cake");
const stageMessage = document.getElementById("stage-message");
const replayBtn = document.getElementById("replay");
const promptEl = document.getElementById("prompt");
const blowCue = document.getElementById("blow-cue");
const lyricLines = Array.from(document.querySelectorAll(".lyric-line"));
const song = document.getElementById("song");
const applause = document.getElementById("applause");

/* ---- TEMPI da regolare sul TUO audio (secondi dall'inizio) ----
   Ogni valore = quando compare la riga corrispondente.
   BLOW_AFTER = secondi dopo l'ultima riga per mostrare "Soffia!". */
// l'audio ripete la canzone DUE volte → anche le parole fanno due giri
const LYRIC_TIMES = [4.3, 7.5, 10.7, 13.9,  18.5, 21.7, 24.9, 28.1];
const LINE_FOR    = [0, 1, 2, 3,            0, 1, 2, 3];
const RESET_AT    = 17.8;  // pulisce le parole prima del 2° giro
const BLOW_AFTER  = 5.9;   // "Soffia!" appare quando la canzone è finita (~34s), così il soffio non la interrompe
const VOLUME      = 0.4;   // volume dell'audio (0 = muto, 1 = massimo)

// stati: "idle" → "singing" → "ready" (si può spegnere) → "done"
let state = "idle";
let timers = [];
let micStream = null;
let micRAF = null;
let readyAt = 0; // istante in cui compare "Soffia!" (per la pausa di grazia del microfono)

/* ---------- Coriandoli ---------- */
const canvas = document.getElementById("confetti");
const ctx = canvas.getContext("2d");
const COLORS = ["#ff6b6b", "#4d96ff", "#ffd166", "#a0e7e5", "#ff8fab", "#c77dff"];
let pieces = [];
let W, H;

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

function makePiece(burst = false) {
  return {
    x: Math.random() * W,
    y: burst ? H / 2 : Math.random() * -H,
    size: 6 + Math.random() * 8,
    color: COLORS[(Math.random() * COLORS.length) | 0],
    speedY: burst ? -6 - Math.random() * 6 : 1.5 + Math.random() * 2.5,
    speedX: (Math.random() - 0.5) * (burst ? 8 : 2),
    rot: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.3,
    gravity: burst ? 0.18 : 0,
  };
}
for (let i = 0; i < 70; i++) pieces.push(makePiece());

function burstConfetti(n = 220) {
  for (let i = 0; i < n; i++) pieces.push(makePiece(true));
}

function drawConfetti() {
  ctx.clearRect(0, 0, W, H);
  for (const p of pieces) {
    p.speedY += p.gravity;
    p.x += p.speedX;
    p.y += p.speedY;
    p.rot += p.spin;
    if (p.gravity === 0 && p.y > H + 20) {
      p.y = -20;
      p.x = Math.random() * W;
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    ctx.restore();
  }
  pieces = pieces.filter((p) => !(p.gravity > 0 && p.y > H + 40));
  requestAnimationFrame(drawConfetti);
}
drawConfetti();

/* ---------- Parole ---------- */
function showLine(i) {
  lyricLines.forEach((l) => l.classList.remove("current"));
  const line = lyricLines[i];
  if (line) line.classList.add("show", "current");
}

function clearLyrics() {
  lyricLines.forEach((l) => l.classList.remove("show", "current"));
}

/* ---------- Flusso ---------- */
function startSequence() {
  state = "singing";
  promptEl.classList.remove("visible");

  // avvia l'audio (se il file manca, l'esperienza va avanti comunque, in silenzio)
  song.volume = VOLUME;
  song.currentTime = 0;
  song.play().catch(() => {});

  // "sblocca" gli applausi ora (col tocco) in MUTO: iOS ignora volume=0 ma rispetta muted,
  // così non si sente nessun applauso anticipato durante la canzone
  try {
    applause.muted = true;
    applause.play().then(() => {
      applause.pause();
      applause.currentTime = 0;
      applause.muted = false;
      applause.volume = 0.8;
    }).catch(() => { applause.muted = false; });
  } catch (e) {}

  setupMic(); // chiede il microfono ora (gesto utente); soffio attivo solo da "ready"

  // parole a tempo (due giri, con reset in mezzo)
  LYRIC_TIMES.forEach((sec, k) => {
    timers.push(setTimeout(() => showLine(LINE_FOR[k]), sec * 1000));
  });
  timers.push(setTimeout(clearLyrics, RESET_AT * 1000));

  // a fine testo → "Soffia!"
  const endMs = (LYRIC_TIMES[LYRIC_TIMES.length - 1] + BLOW_AFTER) * 1000;
  timers.push(setTimeout(onTextDone, endMs));
}

function onTextDone() {
  state = "ready";
  readyAt = performance.now();
  lyricLines.forEach((l) => l.classList.remove("current"));
  blowCue.classList.add("show");
}

function blowOut() {
  if (state !== "ready") return;
  state = "done";
  // applausi SUBITO (nello stesso gesto del tocco → non vengono bloccati) 👏
  try { applause.muted = false; applause.currentTime = 0; applause.volume = 0.8; applause.play().catch(() => {}); } catch (e) {}
  blowCue.classList.remove("show");
  candles.forEach((c, i) => setTimeout(() => c.classList.add("out"), i * 180));
  stopMic();
  try { song.pause(); } catch (e) {}
  setTimeout(() => {
    stageCake.classList.add("hidden");
    stageMessage.classList.remove("hidden");
    burstConfetti(220);
  }, candles.length * 180 + 550);
}

cake.addEventListener("click", () => {
  if (state === "idle") startSequence();
  else if (state === "ready") blowOut();
  // durante "singing" i tocchi si ignorano: prima si ascolta la canzone
});

/* prompt iniziale: compare dopo che la torta si è costruita */
setTimeout(() => {
  if (state === "idle") promptEl.classList.add("visible");
}, 1800);

/* ---------- Replay ---------- */
function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}
replayBtn.addEventListener("click", () => {
  clearTimers();
  state = "idle";
  candles.forEach((c) => c.classList.remove("out"));
  lyricLines.forEach((l) => l.classList.remove("show", "current"));
  blowCue.classList.remove("show");
  try { song.pause(); song.currentTime = 0; } catch (e) {}
  try { applause.pause(); applause.currentTime = 0; } catch (e) {}
  stageMessage.classList.add("hidden");
  stageCake.classList.remove("hidden");
  promptEl.textContent = "🎵 Tocca la torta per iniziare";
  promptEl.classList.add("visible");
});

/* ---------- BONUS: soffio nel microfono (attivo solo da "ready") ---------- */
async function setupMic() {
  if (micStream || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
  try {
    // niente noiseSuppression/echoCancellation: altrimenti il browser
    // scambia il SOFFIO per rumore e lo cancella → il soffio non verrebbe rilevato
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    const mCtx = new (window.AudioContext || window.webkitAudioContext)();
    // dopo la richiesta permesso l'AudioContext può partire "sospeso": riattivalo
    if (mCtx.state === "suspended") { try { await mCtx.resume(); } catch (e) {} }
    const source = mCtx.createMediaStreamSource(micStream);
    const analyser = mCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const BLOW_THRESHOLD = 85;  // quanto forte dev'essere il soffio (0-255): valore medio
    const NEEDED_FRAMES  = 4;   // istanti consecutivi di soffio richiesti
    const GRACE_MS       = 800; // dopo "Soffia!" il mic ignora l'aria per un attimo (fa comparire la scritta)
    let loud = 0; // frame consecutivi "rumorosi" (evita spegnimenti accidentali)
    const listen = () => {
      analyser.getByteFrequencyData(data);
      // il soffio concentra energia sulle basse frequenze: guardiamo lì
      const N = 40;
      let sum = 0;
      for (let i = 0; i < N; i++) sum += data[i];
      const avg = sum / N;
      const armed = state === "ready" && performance.now() - readyAt > GRACE_MS;
      if (armed) {
        if (avg > BLOW_THRESHOLD) {
          if (++loud >= NEEDED_FRAMES) blowOut();
        } else if (loud > 0) {
          loud--;
        }
      } else {
        loud = 0;
      }
      micRAF = requestAnimationFrame(listen);
    };
    listen();
  } catch (e) {
    /* niente microfono: si spegne col tap, nessun problema */
  }
}

function stopMic() {
  if (micRAF) cancelAnimationFrame(micRAF);
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
}
