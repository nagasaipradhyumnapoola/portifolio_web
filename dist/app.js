import { portfolioConfig } from './config.js';
import { createPortraitScene } from './scene.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const root = document.documentElement;
const sections = [...document.querySelectorAll('main > section')];
const navLinks = [...document.querySelectorAll('[data-section]')];
const motionButton = document.querySelector('#motion-toggle');
const burstButton = document.querySelector('#burst-button');
const soundButton = document.querySelector('#sound-toggle');
const soundLabel = document.querySelector('#sound-label');
const motionLabel = document.querySelector('#motion-label');
const chapterCount = document.querySelector('#chapter-count');
const fallback = document.querySelector('.portrait-fallback');
const storyIntro = document.querySelector('#story-intro');
const beginButton = document.querySelector('#begin-story');
const skipStoryButton = document.querySelector('#skip-story');
const sceneTransition = document.querySelector('#scene-transition');
const transitionLabel = document.querySelector('#transition-label');
const storyButtons = [...document.querySelectorAll('.story-next')];
let scene = null;
let motion = !reduceMotion.matches;
let scrollFrame = 0;
let lastChapter = -1;

function createSoundEngine() {
  let context = null;
  let master = null;
  let ambient = [];
  let enabled = false;

  function ensureContext() {
    if (context) return;
    context = new (window.AudioContext || window.webkitAudioContext)();
    master = context.createGain();
    master.gain.value = 0.42;
    master.connect(context.destination);
  }

  function tone(frequency, duration = 0.09, volume = 0.035, type = 'sine', delay = 0) {
    if (!enabled || !context) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function noise(duration = 0.45, volume = 0.055) {
    if (!enabled || !context) return;
    const frames = Math.round(context.sampleRate * duration);
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1100, context.currentTime);
    filter.frequency.exponentialRampToValueAtTime(120, context.currentTime + duration);
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(master);
    source.start();
  }

  function startAmbient() {
    const bus = context.createGain();
    const filter = context.createBiquadFilter();
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    bus.gain.value = 0.026;
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    lfo.frequency.value = 0.075;
    lfoGain.gain.value = 0.008;
    lfo.connect(lfoGain).connect(bus.gain);
    bus.connect(filter).connect(master);
    const drones = [43.65, 65.41].map((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      oscillator.connect(bus);
      oscillator.start();
      return oscillator;
    });
    lfo.start();
    ambient = [...drones, lfo, bus, filter, lfoGain];
  }

  function stopAmbient() {
    ambient.forEach(node => { try { node.stop?.(); } catch {} try { node.disconnect?.(); } catch {} });
    ambient = [];
  }

  function sync() {
    soundButton.setAttribute('aria-pressed', String(enabled));
    soundButton.setAttribute('aria-label', enabled ? 'Disable interface sound' : 'Enable interface sound');
    soundLabel.textContent = enabled ? 'SOUND ON' : 'SOUND OFF';
  }

  return {
    toggle() {
      try {
        ensureContext();
        enabled = !enabled;
        if (enabled) {
          context.resume?.().catch(() => {});
          startAmbient();
          tone(523.25, 0.12, 0.045);
        }
        else stopAmbient();
        sync();
      } catch {
        enabled = false;
        stopAmbient();
        soundButton.setAttribute('aria-pressed', 'false');
        soundButton.setAttribute('aria-label', 'Interface sound unavailable in this browser');
        soundLabel.textContent = 'SOUND UNAVAILABLE';
      }
    },
    click() { tone(880, 0.055, 0.025, 'sine'); },
    chapter(index) { tone(174.61 * Math.pow(2, index / 12), 0.24, 0.032, 'triangle'); },
    burst() { noise(); tone(58, 0.5, 0.09, 'sine'); tone(740, 0.18, 0.03, 'triangle', 0.05); },
  };
}

const sound = createSoundEngine();
let storyStarted = false;
let transitioning = false;

document.body.classList.add('story-locked');
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
history.replaceState(null, '', `${location.pathname}${location.search}`);
window.scrollTo({ top: 0, behavior: 'auto' });
requestAnimationFrame(() => beginButton.focus({ preventScroll: true }));

function sceneDelay(normal, reduced = 80) {
  return reduceMotion.matches ? reduced : normal;
}

function jumpTo(target) {
  const previousBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollTo(0, target.offsetTop);
  requestAnimationFrame(() => { root.style.scrollBehavior = previousBehavior; });
}

function advanceTo(targetId, label) {
  if (transitioning) return;
  const target = document.getElementById(targetId);
  if (!target) return;
  transitioning = true;
  document.body.classList.add('is-transitioning');
  transitionLabel.textContent = label;
  sceneTransition.hidden = false;
  storyButtons.forEach(button => {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
  });
  sound.burst();
  requestAnimationFrame(() => sceneTransition.classList.add('is-active'));
  setTimeout(() => {
    history.replaceState(null, '', `#${targetId}`);
    jumpTo(target);
    updateScroll();
  }, sceneDelay(570));
  setTimeout(() => sceneTransition.classList.remove('is-active'), sceneDelay(1120, 140));
  setTimeout(() => {
    sceneTransition.hidden = true;
    document.body.classList.remove('is-transitioning');
    storyButtons.forEach(button => {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    });
    jumpTo(target);
    updateScroll();
    transitioning = false;
  }, sceneDelay(1660, 220));
}

function beginStory(targetId = 'intro', label = '01 / INTRO') {
  if (storyStarted) return;
  storyStarted = true;
  beginButton.disabled = true;
  beginButton.classList.add('is-starting');
  beginButton.querySelector('span').textContent = 'ENTERING';
  sound.click();
  setTimeout(() => storyIntro.classList.add('is-leaving'), sceneDelay(330, 0));
  setTimeout(() => {
    storyIntro.hidden = true;
    document.body.classList.remove('story-locked');
    if (targetId === 'intro') {
      history.replaceState(null, '', '#intro');
      jumpTo(document.getElementById('intro'));
      scene?.burst();
      updateScroll();
    } else advanceTo(targetId, label);
  }, sceneDelay(980, 20));
}

beginButton.addEventListener('click', () => beginStory());
skipStoryButton.addEventListener('click', () => beginStory('projects', '03 / SELECTED WORK'));
storyButtons.forEach(button => {
  button.addEventListener('click', () => advanceTo(button.dataset.next, button.dataset.nextLabel));
});
navLinks.forEach(link => {
  link.addEventListener('click', event => {
    if (!storyIntro.hidden) return;
    event.preventDefault();
    const chapter = sections.findIndex(section => section.id === link.dataset.section);
    const label = `${String(chapter + 1).padStart(2, '0')} / ${link.getAttribute('aria-label') || link.textContent}`;
    advanceTo(link.dataset.section, label.toUpperCase());
  });
});

function updateMotion() {
  document.body.classList.toggle('is-motion-paused', !motion);
  motionButton.setAttribute('aria-pressed', String(motion));
  motionButton.setAttribute('aria-label', motion ? 'Pause visual motion' : 'Enable visual motion');
  motionLabel.textContent = motion ? 'MOTION ON' : 'MOTION OFF';
  motionButton.querySelector('.motion-symbol').textContent = motion ? 'Ⅱ' : '▷';
  burstButton.disabled = !motion;
  burstButton.title = motion ? 'Scatter the portrait into pixels' : 'Enable motion to scatter the portrait';
  scene?.setMotion(motion);
}
motionButton.addEventListener('click', () => { motion = !motion; updateMotion(); sound.click(); });
reduceMotion.addEventListener('change', event => { motion = !event.matches; updateMotion(); });
soundButton.addEventListener('click', () => sound.toggle());
burstButton.addEventListener('click', () => { scene?.burst(); sound.burst(); });
document.querySelector('.hero').addEventListener('pointerdown', event => {
  if (!event.target.closest('a, button') && event.pointerType === 'mouse') { scene?.burst(); sound.burst(); }
});
window.addEventListener('pointermove', event => scene?.pointer(event.clientX, event.clientY), { passive: true });
document.addEventListener('pointerleave', () => scene?.clearPointer());

function updateScroll() {
  scrollFrame = 0;
  const maxScroll = root.scrollHeight - innerHeight;
  root.style.setProperty('--scroll', String(maxScroll > 0 ? scrollY / maxScroll : 0));
  const heroProgress = Math.max(0, Math.min(1, scrollY / (innerHeight * 0.75)));
  root.style.setProperty('--hero-progress', String(heroProgress * 0.75));
  scene?.setProgress(heroProgress);
  const readingPosition = scrollY + innerHeight * 0.4;
  let chapter = 0;
  sections.forEach((section, index) => { if (section.offsetTop <= readingPosition) chapter = index; });
  const activeId = sections[chapter].id;
  navLinks.forEach(link => {
    if (link.dataset.section === activeId) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
  document.body.dataset.chapter = activeId;
  chapterCount.textContent = `${String(chapter + 1).padStart(2, '0')} / 05`;
  if (chapter !== lastChapter) {
    if (lastChapter >= 0) sound.chapter(chapter);
    lastChapter = chapter;
  }
  const showScene = scrollY < sections[1].offsetTop || activeId === 'contact';
  scene?.setActive(showScene);
  fallback.style.opacity = String(1 - heroProgress);
}
function scheduleScroll() { if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll); }
window.addEventListener('scroll', scheduleScroll, { passive: true });
window.addEventListener('resize', scheduleScroll, { passive: true });
updateMotion(); updateScroll();

createPortraitScene(document.querySelector('#portrait-scene'), { portrait: portfolioConfig.portrait, motion })
  .then(result => {
    scene = result;
    if (!result) {
      burstButton.hidden = true;
      document.querySelector('.pointer-hint').hidden = true;
    }
    updateMotion(); updateScroll();
  })
  .catch(error => {
    console.warn('Interactive portrait unavailable; keeping the still portrait.', error);
    burstButton.hidden = true;
    document.querySelector('.pointer-hint').hidden = true;
  });
fallback.addEventListener('error', () => document.querySelector('.scene-wrap').classList.add('portrait-error'));

document.querySelectorAll('a[href^="#"], details').forEach(element => {
  element.addEventListener(element.tagName === 'DETAILS' ? 'toggle' : 'click', () => sound.click());
});

if (motion && 'IntersectionObserver' in window) {
  document.body.classList.add('has-story-motion');
  const reveal = new IntersectionObserver(entries => {
    entries.forEach(entry => entry.target.classList.toggle('is-visible', entry.isIntersecting));
  }, { threshold: 0.12, rootMargin: '-6% 0px -12%' });
  sections.slice(1).forEach(section => reveal.observe(section));
}

const copyButton = document.querySelector('#copy-email');
const copyStatus = document.querySelector('#copy-status');
copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(portfolioConfig.email);
    copyStatus.textContent = 'Email copied.';
  } catch {
    copyStatus.textContent = portfolioConfig.email;
  }
});

// An exact user-supplied recording can be layered over the original interface
// sound design later. No substitute track is used.
if (portfolioConfig.soundtrack.src) {
  const audio = new Audio(portfolioConfig.soundtrack.src);
  audio.loop = true; audio.preload = 'none'; audio.volume = portfolioConfig.soundtrack.volume;
  soundButton.addEventListener('click', async () => {
    if (soundButton.getAttribute('aria-pressed') === 'true') {
      try { await audio.play(); } catch { audio.pause(); }
    } else audio.pause();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) audio.pause(); });
}
