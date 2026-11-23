import { initReveal, initParallax, initSpotlight, initProgress, initFaq, initDots } from './ui.js';
import { initCA } from './ca.js';
import { initBoard } from './board.js';

initProgress();
initCA();
initFaq();
initSpotlight();
initBoard();
initReveal();
initParallax();
initDots();
document.documentElement.classList.add('ready');
