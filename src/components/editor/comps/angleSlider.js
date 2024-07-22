import { makeEl } from '../utils.js';

export default class AngleSlider extends EventTarget {
  constructor({ parent }) {
    super();
    this.el = makeEl('div', 'a-angle-slider', { parent });

    this.labelsEl = makeEl('div', 'a-angle-slider__labels', { parent: this.el });
    this.markEl = makeEl('div', 'a-angle-slider__mark', { parent: this.el, html: `<svg width="6" height="4" viewBox="0 0 6 4" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M2.29289 0.707106L0.28033 2.71967C-0.192143 3.19214 0.142482 4 0.81066 4H5.18934C5.85752 4 6.19214 3.19214 5.71967 2.71967L3.70711 0.707107C3.31658 0.316583 2.68342 0.316582 2.29289 0.707106Z" fill="currentColor"/>
</svg>` });
    this.dotsEl = makeEl('div', 'a-angle-slider__dots', { parent: this.el });

    for (let angle = -90; angle <= 90; angle += 15) {
      makeEl('div', (angle == 0 ? 'is-zero' : (angle < 0 ? 'is-neg' : '')), { parent: this.labelsEl, text: `${angle}°` });
    }
    for (let angle = -90; angle <= 90; angle += 3) {
      makeEl('div', (angle == 0 ? 'is-zero' : (angle % 15 == 0 ? 'is-large' : '')), { parent: this.dotsEl });
    }

    this.angle = 0;
    this.el.style.setProperty('--angle', this.angle);
    
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.el.addEventListener('pointerdown', this.onPointerDown);
  }

  onPointerDown(ev) {
    this.drag = {
      x0: ev.clientX, y0: ev.clientY,
      angle0: this.angle,
    }
    document.addEventListener('pointermove', this.onPointerMove);
    document.addEventListener('pointerup', this.onPointerUp);
  }

  onPointerMove(ev) {
    if (!this.drag) {
      return;
    }
    const dx = ev.clientX - this.drag.x0;
    this.angle = Math.max(-90, Math.min(90, this.drag.angle0 + dx * 180 / this.el.offsetWidth));
    this.el.style.setProperty('--angle', this.angle);
    this.dispatchEvent(new Event('change'));
  }

  onPointerUp(ev) {
    this.drag = false;
    document.removeEventListener('pointermove', this.onPointerMove);
    document.removeEventListener('pointerup', this.onPointerUp);

    if (Math.abs(this.angle) < 1) {
      // TODO: animate towards 0
      this.angle = 0;
      this.el.style.setProperty('--angle', this.angle);
      this.dispatchEvent(new Event('change'));
    }
  }

  setAngle(newAngle) {
    this.angle = newAngle;
    this.el.style.setProperty('--angle', newAngle);
  }
}