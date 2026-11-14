// Header hairline, section reveals, nav state, Bengaluru clock, and the portrait.
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// Header gains a hairline once the page has moved
(function () {
  const header = document.getElementById('siteHeader');
  if (!header) return;
  const update = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  update();
  window.addEventListener('scroll', update, { passive: true });
})();

// Reveal on scroll, staggered among siblings that enter together
(function () {
  const items = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    let n = 0;
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.style.setProperty('--d', n++);
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  items.forEach((el) => io.observe(el));
})();

// Mark the section in view in the nav
(function () {
  const links = [...document.querySelectorAll('.site-nav a')];
  const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const sections = [...document.querySelectorAll('main section[id]')];
  if (!sections.length) return;

  function update() {
    const line = window.innerHeight * 0.35;
    let current = null;
    sections.forEach((s) => {
      if (s.getBoundingClientRect().top <= line) current = s.id;
    });
    // Short final section: treat the page bottom as "contact"
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
      current = sections[sections.length - 1].id;
    }
    links.forEach((a) => a.removeAttribute('aria-current'));
    const active = byId.get(current);
    if (active) active.setAttribute('aria-current', 'true');
  }

  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
})();

// Local time in Bengaluru
(function () {
  const el = document.getElementById('clock');
  if (!el) return;
  const fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  const tick = () => { el.textContent = fmt.format(new Date()); };
  tick();
  setInterval(tick, 15000);
})();

// Copy the email address, for visitors without a mail client set up
(function () {
  const btn = document.getElementById('copyEmail');
  if (!btn) return;
  if (!navigator.clipboard) {
    btn.hidden = true;
    return;
  }
  const idle = btn.textContent;
  let timer;
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = 'Copied';
    } catch (err) {
      btn.textContent = 'Press ⌘C to copy';
    }
    clearTimeout(timer);
    timer = setTimeout(() => { btn.textContent = idle; }, 1800);
  });
})();

// Portrait: resolved from Gaussian noise on load, and switched between the photo
// and the illustration SDEdit-style (noise partway, then denoise toward the other).
// If the canvas can't read pixels (e.g. opened from disk), the images cross-fade instead.
(function () {
  const root = document.getElementById('portrait');
  const canvas = document.getElementById('portraitCanvas');
  const readout = document.getElementById('stepReadout');
  if (!root || !canvas) return;

  const buttons = [...root.querySelectorAll('[data-portrait]')];
  const imgs = {
    photo: root.querySelector('img[data-which="photo"]'),
    illustration: root.querySelector('img[data-which="illustration"]'),
  };
  const labels = {
    photo: imgs.photo.alt,
    illustration: 'Anime-style illustration of Charchit Sharma in a beanie, sunglasses and scarf',
  };

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const W = canvas.width;
  const H = canvas.height;
  const N = W * H;
  const T = 1000;
  const START = 0.6; // noise level the portrait resolves from on load

  // Cosine noise schedule (Nichol & Dhariwal, 2021)
  const alphaBar = (t) => {
    const s = 0.008;
    const f = (x) => Math.cos(((x + s) / (1 + s)) * Math.PI / 2) ** 2;
    return f(t) / f(0);
  };

  // One fixed draw of Gaussian noise per pixel (Box–Muller), shared across channels
  // so the grain reads as neutral film noise rather than colour static
  const eps = new Float32Array(N * 3);
  for (let p = 0; p < N; p++) {
    const u = 1 - Math.random();
    const v = Math.random();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    eps[p * 3] = eps[p * 3 + 1] = eps[p * 3 + 2] = z;
  }

  const frame = ctx.createImageData(W, H);
  for (let i = 3; i < frame.data.length; i += 4) frame.data[i] = 255;

  function loadPixels(img) {
    return img.decode().then(() => {
      ctx.drawImage(img, 0, 0, W, H);
      const d = ctx.getImageData(0, 0, W, H).data; // throws on file:// in some browsers
      const x0 = new Float32Array(N * 3);
      for (let p = 0, q = 0; p < N; p++, q += 4) {
        x0[p * 3] = d[q] / 127.5 - 1;
        x0[p * 3 + 1] = d[q + 1] / 127.5 - 1;
        x0[p * 3 + 2] = d[q + 2] / 127.5 - 1;
      }
      return x0;
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
        const u = Math.min(1, Math.max(0, (now - start) / duration));
        step(u);
        if (u < 1) requestAnimationFrame(tick);
        else resolve();
      }
      requestAnimationFrame(tick);
    });
  }

  const smooth = (x) => x * x * (3 - 2 * x);

  const pixels = {};
  let live = false;
  let current = 'photo';
  let busy = false;

  function setCurrent(which) {
    current = which;
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.portrait === which)));
    imgs.photo.alt = labels[which];
    root.classList.toggle('show-illustration', which === 'illustration');
  }

  async function init() {
    try {
      pixels.photo = await loadPixels(imgs.photo);
      pixels.illustration = await loadPixels(imgs.illustration);
      live = true;
    } catch (err) {
      if (readout) readout.hidden = true;
      root.classList.add('is-ready');
      return;
    }

    if (reduceMotion.matches) {
      render(0, pixels.photo);
      root.classList.add('is-live', 'is-ready');
      return;
    }

    busy = true;
    render(START, pixels.photo);
    root.classList.add('is-live', 'is-ready');
    await animate(2400, (u) => render(START * (1 - smooth(u)), pixels.photo));
    busy = false;
  }

  async function switchTo(next) {
    if (busy || next === current) return;
    const a = pixels[current];
    const b = pixels[next];
    setCurrent(next);
    if (!live) return; // CSS cross-fade handles it

    if (reduceMotion.matches) {
      render(0, b);
      return;
    }

    busy = true;
    const peak = 0.55; // how far to re-noise before denoising toward the other image
    await animate(1800, (u) => {
      const t = u < 0.4 ? peak * smooth(u / 0.4) : peak * (1 - smooth((u - 0.4) / 0.6));
      const mix = smooth(Math.min(1, Math.max(0, (u - 0.3) / 0.25)));
      render(t, a, b, mix);
    });
    render(0, b);
    busy = false;
  }

  buttons.forEach((b) => b.addEventListener('click', () => switchTo(b.dataset.portrait)));

  init();
})();
