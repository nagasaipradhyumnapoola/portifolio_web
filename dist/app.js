const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const body = document.body;
const gate = document.querySelector('#story-gate');
const transition = document.querySelector('#scene-transition');
const transitionNumber = document.querySelector('#transition-number');
const transitionTitle = document.querySelector('#transition-title');
const chapters = [...document.querySelectorAll('.chapter')];
const storyLinks = [...document.querySelectorAll('[data-story-link]')];
let transitionTimer = 0;

const chapterMeta = Object.fromEntries(chapters.map(section => [section.id, {
  number: section.dataset.chapter,
  title: section.dataset.title,
  element: section
}]));

function createSound() {
  let context;
  let output;
  let enabled = false;

  function setup() {
    if (context) return;
    context = new (window.AudioContext || window.webkitAudioContext)();
    output = context.createGain();
    output.gain.value = 0.28;
    output.connect(context.destination);
  }

  function tone(frequency, duration = .1, delay = 0, type = 'sine', volume = .08) {
    if (!enabled || !context) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain).connect(output);
    oscillator.start(start);
    oscillator.stop(start + duration + .03);
  }

  function softNoise() {
    if (!enabled || !context) return;
    const duration = .55;
    const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index++) data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, context.currentTime);
    filter.frequency.exponentialRampToValueAtTime(160, context.currentTime + duration);
    gain.gain.setValueAtTime(.07, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + duration);
    source.connect(filter).connect(gain).connect(output);
    source.start();
  }

  return {
    toggle(button, label) {
      try {
        setup();
        enabled = !enabled;
        if (enabled) {
          context.resume();
          tone(392, .13, 0, 'triangle', .08);
          tone(587.33, .18, .07, 'sine', .06);
        }
        button.setAttribute('aria-pressed', String(enabled));
        label.textContent = enabled ? 'Sound on' : 'Sound off';
      } catch {
        enabled = false;
        label.textContent = 'Unavailable';
      }
    },
    click() { tone(660, .055, 0, 'sine', .045); },
    scene() { softNoise(); tone(196, .25, .08, 'triangle', .055); tone(392, .24, .2, 'sine', .045); },
    complete() { [329.63, 493.88, 659.25].forEach((note, index) => tone(note, .16, index * .09, 'triangle', .06)); }
  };
}

const sound = createSound();
const soundButton = document.querySelector('#sound-toggle');
soundButton.addEventListener('click', () => sound.toggle(soundButton, document.querySelector('#sound-label')));

function jumpTo(target) {
  const previous = document.documentElement.style.scrollBehavior;
  document.documentElement.style.scrollBehavior = 'auto';
  window.scrollTo(0, target.offsetTop);
  requestAnimationFrame(() => { document.documentElement.style.scrollBehavior = previous; });
}

function closeGate(targetId = 'intro') {
  gate.classList.add('is-leaving');
  body.classList.remove('story-locked');
  const target = chapterMeta[targetId]?.element || chapterMeta.intro.element;
  jumpTo(target);
  setTimeout(() => target.querySelector('h2')?.focus({ preventScroll: true }), 650);
}

document.querySelector('#start-story').addEventListener('click', event => {
  if (gate.classList.contains('is-entering')) return;
  gate.classList.add('is-entering');
  event.currentTarget.querySelector('span').textContent = 'ENTERING';
  sound.click();
  setTimeout(() => closeGate('intro'), reduceMotion ? 60 : 1050);
});

document.querySelector('#skip-to-work').addEventListener('click', () => {
  sound.click();
  closeGate('memory');
});

document.querySelector('.skip-link').addEventListener('click', event => {
  event.preventDefault();
  closeGate('origin');
});

function goToChapter(id, immediate = false) {
  const chapter = chapterMeta[id];
  if (!chapter || body.classList.contains('is-transitioning')) return;
  if (gate && !gate.classList.contains('is-leaving')) closeGate(id);
  if (immediate || reduceMotion) {
    jumpTo(chapter.element);
    history.replaceState(null, '', `#${id}`);
    return;
  }

  clearTimeout(transitionTimer);
  body.classList.add('is-transitioning');
  transitionNumber.textContent = chapter.number;
  transitionTitle.textContent = chapter.title;
  transition.classList.remove('is-clearing');
  transition.classList.add('is-active');
  transition.setAttribute('aria-hidden', 'false');
  sound.scene();

  setTimeout(() => {
    jumpTo(chapter.element);
    history.replaceState(null, '', `#${id}`);
  }, 470);

  transitionTimer = setTimeout(() => {
    transition.classList.add('is-clearing');
    setTimeout(() => {
      transition.classList.remove('is-active', 'is-clearing');
      transition.setAttribute('aria-hidden', 'true');
      body.classList.remove('is-transitioning');
      chapter.element.querySelector('h2')?.focus({ preventScroll: true });
    }, 440);
  }, 760);
}

document.querySelectorAll('[data-next]').forEach(button => button.addEventListener('click', () => goToChapter(button.dataset.next)));
storyLinks.forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  goToChapter(link.dataset.storyLink);
}));

const degreeContent = {
  srm: { title: 'Build the system.', body: 'Software, algorithms, infrastructure, and the discipline to turn an idea into something usable.' },
  iit: { title: 'Understand the signal.', body: 'Statistics, machine learning, and data thinking for decisions grounded in evidence.' }
};
const degreeNote = document.querySelector('#degree-note');
document.querySelectorAll('[data-degree]').forEach(card => card.addEventListener('click', () => {
  document.querySelectorAll('[data-degree]').forEach(item => {
    const active = item === card;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  degreeNote.querySelector('strong').textContent = degreeContent[card.dataset.degree].title;
  degreeNote.querySelector('p').textContent = degreeContent[card.dataset.degree].body;
  sound.click();
}));

const memorySteps = [
  ['01 / REMEMBER', 'Keep useful context beyond one conversation.', 'Capture, structure, and update knowledge so the next session starts with continuity.'],
  ['02 / RETRIEVE', 'Bring back what matters now.', 'Semantic retrieval narrows a growing memory into the context relevant to the current task.'],
  ['03 / REASON', 'Connect the new problem to the old evidence.', 'The model works with retrieved context, current input, and an explicit plan instead of starting cold.'],
  ['04 / ACT', 'Turn continuity into useful work.', 'Tools and applications use the same context layer to produce work that stays aligned over time.']
];
const memoryOutput = document.querySelector('#memory-output');
const memoryCanvas = document.querySelector('#memory-canvas');
memoryOutput.dataset.step = '01';
document.querySelectorAll('[data-memory-step]').forEach(tab => tab.addEventListener('click', () => {
  const index = Number(tab.dataset.memoryStep);
  document.querySelectorAll('[data-memory-step]').forEach(item => item.setAttribute('aria-selected', String(item === tab)));
  memoryCanvas.dataset.active = String(index);
  memoryOutput.dataset.step = String(index + 1).padStart(2, '0');
  memoryOutput.querySelector('span').textContent = memorySteps[index][0];
  memoryOutput.querySelector('strong').textContent = memorySteps[index][1];
  memoryOutput.querySelector('p').textContent = memorySteps[index][2];
  sound.click();
}));

function createSimulationPaths() {
  const svg = document.querySelector('#simulation-paths');
  const namespace = 'http://www.w3.org/2000/svg';
  for (let index = 0; index < 42; index++) {
    const path = document.createElementNS(namespace, 'path');
    const startY = 215 + Math.sin(index * 2.17) * 18;
    const bendOne = 85 + Math.sin(index * 1.7) * (35 + index * 1.5);
    const bendTwo = 270 + Math.cos(index * 1.31) * (42 + index * 2.5);
    const endY = 215 + Math.sin(index * .83) * (55 + index * 2.8);
    path.setAttribute('d', `M -20 ${startY.toFixed(1)} C 220 ${bendOne.toFixed(1)}, 520 ${bendTwo.toFixed(1)}, 930 ${endY.toFixed(1)}`);
    path.style.setProperty('--delay', `${(index % 9) * .045}s`);
    svg.appendChild(path);
  }
}
createSimulationPaths();

const simulation = document.querySelector('.simulation-lab');
const runButton = document.querySelector('#run-simulation');
const pathCounter = document.querySelector('#path-counter');
runButton.addEventListener('click', () => {
  if (simulation.classList.contains('is-running')) return;
  simulation.classList.remove('is-complete');
  void simulation.offsetWidth;
  simulation.classList.add('is-running');
  runButton.disabled = true;
  runButton.querySelector('span').textContent = 'SIMULATING';
  sound.scene();
  const duration = reduceMotion ? 80 : 2100;
  const start = performance.now();
  function count(now) {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    pathCounter.textContent = Math.round(5_000_000 * eased).toLocaleString('en-US');
    if (progress < 1) requestAnimationFrame(count);
    else {
      simulation.classList.remove('is-running');
      simulation.classList.add('is-complete');
      runButton.disabled = false;
      runButton.querySelector('span').textContent = 'RUN AGAIN';
      sound.complete();
    }
  }
  requestAnimationFrame(count);
});

const copyButton = document.querySelector('#copy-email');
const copyStatus = document.querySelector('#copy-status');
copyButton.addEventListener('click', async () => {
  const email = 'nagasaipradhyumnapoola@gmail.com';
  try {
    await navigator.clipboard.writeText(email);
    copyStatus.textContent = 'EMAIL COPIED';
  } catch {
    copyStatus.textContent = email;
  }
  sound.click();
});

let scrollTick = 0;
function updateScroll() {
  const available = document.documentElement.scrollHeight - innerHeight;
  document.documentElement.style.setProperty('--progress', available > 0 ? String(scrollY / available) : '0');
  scrollTick = 0;
}
addEventListener('scroll', () => {
  if (!scrollTick) scrollTick = requestAnimationFrame(updateScroll);
}, { passive: true });
updateScroll();

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    entry.target.classList.toggle('is-visible', entry.isIntersecting);
    if (!entry.isIntersecting || entry.intersectionRatio < .35) return;
    storyLinks.forEach(link => {
      const active = link.dataset.storyLink === entry.target.id;
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  });
}, { threshold: [.12, .35, .62] });
chapters.forEach(chapter => observer.observe(chapter));

if (!reduceMotion) {
  const hero = document.querySelector('.hero-chapter');
  hero.addEventListener('pointermove', event => {
    const bounds = hero.getBoundingClientRect();
    hero.style.setProperty('--mx', ((event.clientX - bounds.left) / bounds.width - .5).toFixed(3));
    hero.style.setProperty('--my', ((event.clientY - bounds.top) / bounds.height - .5).toFixed(3));
  });
}

document.querySelectorAll('a[target="_blank"]').forEach(link => link.addEventListener('click', () => sound.click()));
