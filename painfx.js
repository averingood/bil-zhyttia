// Біль у сценах від першої особи (планерка, розмова з друзями):
// товсті хвилі від тіла внизу поля зору, а на ключовому слові ядро болю
// плавно розростається до верху субтитрів. Малює поверх готового кадру.
(function (root) {
  'use strict';
  const LW = 206, LH = 172;                 // біль у низькій роздільності, як кімната
  const SX = 103, SY = 184;                 // джерело — тіло, під нижнім краєм кадру
  const TEXT_R = (SY - 99) * 1.15;          // від тіла до верху першого рядка субтитрів посередині
  const GROW_IN = 1.0, GROW_OUT = 0.9;      // секунди, за які ядро розростається і стискається
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const bay = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const smooth = (x) => x * x * (3 - 2 * x);
  const RED_IN = hex('#c93b3e'), RED_OUT = hex('#f0aeae'), RED_CORE = hex('#d94a4a');

  function create() {
    const buf = new ImageData(LW, LH);
    const cv = document.createElement('canvas');
    cv.width = LW; cv.height = LH;
    const ctx = cv.getContext('2d');

    // i — біль від 0 до 1; grow — наскільки розрослось ядро (0..1).
    function paint(t, i, grow, scale = 1) {
      const d = buf.data; d.fill(0);
      if (i <= 0 && !grow) return;
      // Товсті хвилі: ширші й повільніші за звичайні.
      const speed = (45 + 75 * i) * 0.85, period = (1.5 - 0.95 * i) * 1.25, th = 6 + 11 * i, rMax = 40 + 190 * i;
      const list = [];
      if (i > 0) for (let k = Math.floor(t / period); k >= 0; k--) { const r = (t - k * period) * speed + 12; if (r > rMax) break; list.push(r); }
      const baseCore = i > 0 ? 10 + 18 * i + Math.sin(t * (4 + 6 * i)) * (2 + 3 * i) : 0;
      const core = baseCore + (TEXT_R * scale + Math.sin(t * 5) * 3 - baseCore) * grow;
      const fringe = 2 + 6 * grow;
      for (let y = Math.max(0, Math.floor(SY - Math.max(rMax + th, core + 8))); y < LH; y++) for (let x = 0; x < LW; x++) {
        const dd = Math.hypot(x + 0.5 - SX, (y + 0.5 - SY) * 1.15);
        let col = null;
        if (dd < core) { if (dd < core - fringe || bay(x, y) < (core - dd) / fringe) col = RED_CORE; }
        else for (const r of list) {
          const kk = dd - (r - th);
          if (kk < 0 || kk > th * 2) continue;
          if (bay(x, y) > (1 - r / rMax) * (0.55 + 0.45 * i) * 1.25) continue;
          const f = kk / (th * 2);
          col = [RED_IN[0] + (RED_OUT[0] - RED_IN[0]) * f, RED_IN[1] + (RED_OUT[1] - RED_IN[1]) * f, RED_IN[2] + (RED_OUT[2] - RED_IN[2]) * f];
          break;
        }
        if (col) { const j = (y * LW + x) * 4; d[j] = col[0]; d[j + 1] = col[1]; d[j + 2] = col[2]; d[j + 3] = 255; }
      }
    }

    // g — контекст кадру, W/H — його розмір; glitch — {start, end} або null.
    function draw(g, W, H, t, pain, glitch, painkiller) {
      let grow = 0;
      if (glitch && t > glitch.start - GROW_IN && t < glitch.end + GROW_OUT) {
        grow = t < glitch.start ? smooth((t - glitch.start + GROW_IN) / GROW_IN) : t > glitch.end ? smooth(1 - (t - glitch.end) / GROW_OUT) : 1;
      }
      // Кожен напад трохи іншого розміру (від −5% до +15% діаметра): так не вивчиш, де саме край і що лишиться видно.
      if (glitch && glitch.scale == null) glitch.scale = 0.95 + Math.random() * 0.2;
      paint(t, pain / 10, grow, glitch ? glitch.scale : 1);
      ctx.putImageData(buf, 0, 0);
      g.imageSmoothingEnabled = false;
      g.drawImage(cv, 0, 0, W, H);
      // Знеболювальне: легке двоїння в очах і засвіт. Читати можна, але світ трохи «плаває».
      if (painkiller) {
        const dx = 3 + Math.sin(t * 0.9) * 2, dy = Math.sin(t * 0.6) * 1.2;
        g.save();
        g.globalAlpha = 0.28; g.drawImage(g.canvas, dx * W / LW / 2, dy * H / LH / 2);
        g.globalAlpha = 1;
        const gl = g.createRadialGradient(W * 0.62, H * 0.18, 0, W * 0.62, H * 0.18, W * 0.75);
        gl.addColorStop(0, 'rgba(255,248,230,' + (0.22 + Math.sin(t * 1.3) * 0.04).toFixed(3) + ')');
        gl.addColorStop(1, 'rgba(255,248,230,0)');
        g.globalCompositeOperation = 'screen'; g.fillStyle = gl; g.fillRect(0, 0, W, H);
        g.restore();
      }
    }
    return { draw };
  }

  // Похмурість від радості: 0 на 60 і вище, 1 на нулі. Одна крива для кімнати і сцен.
  const gloomOf = (joy) => Math.max(0, Math.min(1, (60 - joy) / 55));
  // Сцени від першої особи: той самий світ, тільки ближче — вицвітає й темнішає так само.
  function gloom(g, W, H, joy) {
    const k = gloomOf(joy);
    if (k <= 0) return;
    g.save();
    g.filter = 'saturate(' + (1 - 0.85 * k).toFixed(3) + ') brightness(' + (1 - 0.4 * k).toFixed(3) + ')';
    g.drawImage(g.canvas, 0, 0);
    g.filter = 'none';
    g.fillStyle = 'rgba(28,36,62,' + (0.22 * k).toFixed(3) + ')';     // холодний присмерк
    g.fillRect(0, 0, W, H);
    // Краї кадру гаснуть, світ стискається до середини.
    const vg = g.createRadialGradient(W / 2, H / 2, H * (0.7 - 0.25 * k), W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, 'rgba(10,9,16,0)'); vg.addColorStop(1, 'rgba(10,9,16,' + (0.75 * k).toFixed(3) + ')');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    g.restore();
  }

  // Ріст починається заздалегідь — перша репліка має чекати стільки, щоб ядро росло з нуля.
  root.PainFX = { create, gloom, gloomOf, LEAD: GROW_IN + 0.1 };
})(typeof globalThis !== 'undefined' ? globalThis : this);
