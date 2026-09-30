// Call-screen site: dock controls, captions, reactions, desktop files, clock, portrait.
document.documentElement.classList.add('js');

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');

// Stagger for the lettering
document.querySelectorAll('.hello').forEach((h) => {
  h.querySelectorAll('span').forEach((s, i) => s.style.setProperty('--i', i));
});

// Briefly ring a tile, like the active-speaker border
window.speak = function (tile) {
  if (!tile) return;
  tile.classList.add('is-speaking');
  clearTimeout(tile._speakTimer);
  tile._speakTimer = setTimeout(() => tile.classList.remove('is-speaking'), 1400);
};

// Clock in the desktop menu bar (Bengaluru time)
(function () {
  const els = [document.getElementById('clock'), document.getElementById('stampTime')].filter(Boolean);
  if (!els.length) return;
  const fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  const tick = () => { const t = fmt.format(new Date()); els.forEach((el) => { el.textContent = t; }); };
  tick();
  setInterval(tick, 15000);
})();

// Desktop: select a file to see its info; double-click opens it
(function () {
  const files = document.querySelectorAll('.file');
  const meta = document.getElementById('infoMeta');
  const title = document.getElementById('infoTitle');
  const desc = document.getElementById('infoDesc');
  const open = document.getElementById('infoOpen');

  files.forEach((f) => {
    f.addEventListener('click', () => {
      files.forEach((o) => o.setAttribute('aria-pressed', o === f ? 'true' : 'false'));
      meta.textContent = f.dataset.meta;
      title.textContent = f.dataset.title;
      desc.textContent = f.dataset.desc;
      open.href = f.dataset.href;
    });
    f.addEventListener('dblclick', () => window.open(f.dataset.href, '_blank', 'noopener'));
  });
})();

// Captions: a short introduction, line by line
(function () {
  const btn = document.getElementById('ccBtn');
  const box = document.getElementById('captions');
  const line = document.getElementById('captionsLine');
  if (!btn || !box) return;

  const lines = [
    "Hi, I'm Charchit.",
    "I'm an applied scientist at Glance, part of InMobi Group, in Bengaluru.",
    'I work on image generation: virtual try-on and identity-preserving edits.',
    'And on a harder question: did the model actually get better?',
    'Before this: IDfy, Avataar, and IIT Hyderabad.',
    'Thanks for dropping in.',
  ];
  let timers = [];

  function clear() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function typeLine(text, done) {
    if (prefersReduced.matches) {
      line.textContent = text;
      timers.push(setTimeout(done, 2600));
      return;
    }
    let i = 0;
    line.textContent = '';
    const step = () => {
      i += 1;
      line.textContent = text.slice(0, i);
      if (i < text.length) timers.push(setTimeout(step, 28));
      else timers.push(setTimeout(done, 1500));
    };
    step();
  }

  function play(n) {
    if (n >= lines.length) return; // leave the last line up
    typeLine(lines[n], () => play(n + 1));
  }

  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(on));
    btn.querySelector('.sr').textContent = on ? 'Turn off captions' : 'Turn on captions';
    clear();
    box.hidden = !on;
    if (on) {
      window.speak(document.querySelector('.tile--me'));
      play(0);
    }
  });
})();

// Reactions float up from the dock
(function () {
  const btn = document.getElementById('reactBtn');
  const layer = document.getElementById('reactions');
  if (!btn || !layer) return;
  const emoji = ['👋', '🎉', '💙', '🤯', '👏', '✨'];
  let n = 0;
  btn.addEventListener('click', () => {
    const r = document.createElement('span');
    r.className = 'reaction';
    r.textContent = emoji[n++ % emoji.length];
    r.style.setProperty('--dx', Math.round((Math.random() - 0.5) * 80) + 'px');
    layer.appendChild(r);
    r.addEventListener('animationend', () => r.remove());
    const tiles = document.querySelectorAll('.tile');
    window.speak(tiles[Math.floor(Math.random() * tiles.length)]);
  });
})();

// Portrait: sampled from Gaussian noise on load, and switched between the photo
// and the illustration SDEdit-style (noise partway, then denoise toward the other).
(function () {
  const canvas = document.getElementById('portraitCanvas');
  const button = document.getElementById('camBtn');
  const readout = document.getElementById('stepReadout');
  if (!canvas || !button) return;

  const figure = canvas.closest('.tile');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const W = canvas.width;
  const H = canvas.height;
  const N = W * H;
  const T = 1000;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const embedded = window.PORTRAITS || {};
  const sources = {
    photo: {
      src: embedded.photo || './assets/portrait-photo.jpg',
      label: 'Charchit Sharma in a beanie and puffer jacket, mountains behind him',
    },
    illustration: {
      src: embedded.illustration || './assets/portrait-illustration.jpg',
      label: 'Anime-style illustration of Charchit Sharma in a beanie, sunglasses and scarf',
    },
  };

  // Cosine noise schedule (Nichol & Dhariwal, 2021)
  const alphaBar = (t) => {
    const s = 0.008;
    const f = (x) => Math.cos(((x + s) / (1 + s)) * Math.PI / 2) ** 2;
    return f(t) / f(0);
  };

  // One fixed draw of Gaussian noise per pixel and channel (Box–Muller)
  const eps = new Float32Array(N * 3);
  for (let i = 0; i < eps.length; i += 2) {
    const u = 1 - Math.random();
    const v = Math.random();
    const r = Math.sqrt(-2 * Math.log(u));
    eps[i] = r * Math.cos(2 * Math.PI * v);
    if (i + 1 < eps.length) eps[i + 1] = r * Math.sin(2 * Math.PI * v);
  }

  const frame = ctx.createImageData(W, H);
  for (let i = 3; i < frame.data.length; i += 4) frame.data[i] = 255;

  function loadPixels(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, W, H);
        const d = ctx.getImageData(0, 0, W, H).data; // throws on file:// in some browsers
        const x0 = new Float32Array(N * 3);
        for (let p = 0, q = 0; p < N; p++, q += 4) {
          x0[p * 3] = d[q] / 127.5 - 1;
          x0[p * 3 + 1] = d[q + 1] / 127.5 - 1;
          x0[p * 3 + 2] = d[q + 2] / 127.5 - 1;
        }
        resolve(x0);
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  // Render x_t = sqrt(ab) * x0 + sqrt(1 - ab) * eps, where x0 blends a -> b by mix
  function render(t, a, b, mix) {
    const ab = alphaBar(t);
    const sa = Math.sqrt(ab);
    const sn = Math.sqrt(1 - ab);
    const out = frame.data;
    for (let p = 0, q = 0, k = 0; p < N; p++, q += 4, k += 3) {
      for (let c = 0; c < 3; c++) {
        const x0 = b ? a[k + c] + (b[k + c] - a[k + c]) * mix : a[k + c];
        let v = sa * x0 + sn * eps[k + c];
        v = v < -1 ? -1 : v > 1 ? 1 : v;
        out[q + c] = (v + 1) * 127.5;
      }
    }
    ctx.putImageData(frame, 0, 0);
    if (readout) readout.textContent = 't = ' + Math.round(t * (T - 1));
  }

  function animate(duration, step) {
    return new Promise((resolve) => {
      const start = performance.now();
      function tick(now) {
        const u = Math.min(1, (now - start) / duration);
        step(u);
        if (u < 1) requestAnimationFrame(tick);
        else resolve();
      }
      requestAnimationFrame(tick);
    });
  }

  const smooth = (x) => x * x * (3 - 2 * x);

  let pixels = {};
  let current = 'photo';
  let busy = false;

  function setLabel(which) {
    canvas.setAttribute('aria-label', sources[which].label);
    const tip = which === 'photo' ? 'Switch to illustration' : 'Switch to photo';
    button.dataset.tip = tip;
    button.querySelector('.sr').textContent = tip.replace('Switch', 'Switch portrait');
    button.setAttribute('aria-pressed', which === 'illustration' ? 'true' : 'false');
  }

  async function init() {
    try {
      pixels.photo = await loadPixels(sources.photo.src);
      pixels.illustration = await loadPixels(sources.illustration.src);
    } catch (err) {
      // Canvas unavailable: keep the plain photo, hide the toggle
      button.hidden = true;
      if (readout) readout.hidden = true;
      return;
    }

    figure.classList.add('is-live');

    if (reduceMotion.matches) {
      render(0, pixels.photo);
      return;
    }

    busy = true;
    
    render(1, pixels.photo);
    await animate(2600, (u) => render(1 - u, pixels.photo));
    busy = false;
    
  }

  button.addEventListener('click', async () => {
    if (busy || !pixels.photo) return;
    const next = current === 'photo' ? 'illustration' : 'photo';
    window.speak && window.speak(figure);
    if (figure.getBoundingClientRect().bottom < 0) {
      document.getElementById('top').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    }
    const a = pixels[current];
    const b = pixels[next];

    if (reduceMotion.matches) {
      render(0, b);
    } else {
      busy = true;
      
      const peak = 0.62; // how far to re-noise before denoising toward the other image
      await animate(1800, (u) => {
        const t = u < 0.4 ? peak * smooth(u / 0.4) : peak * (1 - smooth((u - 0.4) / 0.6));
        const mix = smooth(Math.min(1, Math.max(0, (u - 0.3) / 0.25)));
        render(t, a, b, mix);
      });
      render(0, b);
      busy = false;
      
    }

    current = next;
    setLabel(next);
  });

  init();
})();
