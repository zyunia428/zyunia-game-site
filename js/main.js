const header = document.getElementById('header');
const nav = document.getElementById('nav');
const indicator = document.getElementById('nav-indicator');
const navLinks = [...nav.querySelectorAll('a')];
const sections = navLinks.map((link) => document.querySelector(link.hash));

let headerHeight = 0;
let currentLink = null;
let clickLocked = false;
let unlockTimer = 0;
let frameRequested = false;

function measureHeader() {
  headerHeight = header.offsetHeight;
  document.documentElement.style.setProperty('--header-h', `${headerHeight}px`);
}

function moveIndicator() {
  if (!currentLink) return;
  indicator.style.opacity = '1';
  indicator.style.transform = `translateX(${currentLink.offsetLeft}px) scaleX(${currentLink.offsetWidth})`;
}

function setActive(link) {
  if (link === currentLink) return;
  currentLink?.classList.remove('active');
  currentLink?.removeAttribute('aria-current');
  currentLink = link;
  link.classList.add('active');
  link.setAttribute('aria-current', 'location');
  moveIndicator();
  if (nav.scrollWidth > nav.clientWidth) {
    nav.scrollTo({ left: link.offsetLeft - (nav.clientWidth - link.offsetWidth) / 2, behavior: 'smooth' });
  }
}

/* The current section is the last one whose top has passed just below the header. */
function linkForScrollPosition() {
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
  if (atBottom) return navLinks[navLinks.length - 1];
  const line = headerHeight + 60;
  let index = 0;
  sections.forEach((section, i) => {
    if (section.getBoundingClientRect().top <= line) index = i;
  });
  return navLinks[index];
}

function onScroll() {
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(() => {
    frameRequested = false;
    header.classList.toggle('is-scrolled', window.scrollY > 4);
    if (!clickLocked) setActive(linkForScrollPosition());
  });
}

/* Keep the clicked item active during smooth scrolling so the indicator does not run through every section. */
function unlock() {
  clickLocked = false;
  clearTimeout(unlockTimer);
}

function lockToLink(link) {
  setActive(link);
  clickLocked = true;
  clearTimeout(unlockTimer);
  unlockTimer = setTimeout(unlock, 1200);
}

function initReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });

  items.forEach((item) => {
    if (item.classList.contains('game')) {
      const position = [...item.parentElement.children].indexOf(item);
      item.style.setProperty('--delay', `${(position % 2) * 90}ms`);
    }
    observer.observe(item);
  });
}

function initLanguageMenu() {
  const menu = document.getElementById('lang');
  document.addEventListener('click', (event) => {
    if (!menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') menu.open = false;
  });
}

function init() {
  measureHeader();
  initReveal();
  initLanguageMenu();

  const linkFromHash = navLinks.find((link) => link.hash === location.hash);
  setActive(linkFromHash ?? linkForScrollPosition());
  header.classList.toggle('is-scrolled', window.scrollY > 4);

  navLinks.forEach((link) => link.addEventListener('click', () => lockToLink(link)));
  document.querySelector('.brand').addEventListener('click', () => lockToLink(navLinks[0]));

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('scrollend', unlock);
  window.addEventListener('wheel', unlock, { passive: true });
  window.addEventListener('touchmove', unlock, { passive: true });
  window.addEventListener('resize', () => {
    measureHeader();
    moveIndicator();
  });
  document.fonts?.ready.then(moveIndicator);
}

init();
