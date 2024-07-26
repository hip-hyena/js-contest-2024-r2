import { getContrastColor, hexToRgb, hsvToRgb, makeEl, rgbToHex, rgbToHsv } from '../utils.js';

export default class ColorPicker extends EventTarget {
  constructor({ parent, callbacks }) {
    super();
    this.callbacks = callbacks;
    this.el = makeEl('div', 'a-color-picker', { parent });

    this.paletteEl = makeEl('div', 'a-color-picker__palette', { parent: this.el });
    this.colors = ['#FFFFFF', '#FE4438', '#FF8901', '#FFD60A', '#33C759', '#62E5E0', '#0A84FF', '#BD5CF3'].map((color, index) => {
      const el = makeEl('div', 'a-color-picker__color', { parent: this.paletteEl });
      el.style.setProperty('--color', color);
      callbacks.listen(el, 'click', () => {
        this.selectColor(color);
      });
      return { color, el }
    });
    this.customEl = makeEl('div', 'a-color-picker__custom', { parent: this.paletteEl });

    this.hueInput = makeEl('input', ['a-color-picker__hue', 'is-hidden'], { parent: this.paletteEl });
    this.hueInput.type = 'range';
    this.hueInput.min = 0;
    this.hueInput.max = 360;
    callbacks.listen(this.hueInput, 'input', () => {
      const hsv = rgbToHsv(hexToRgb(this.color));
      this.selectColor(rgbToHex(hsvToRgb([this.hueInput.value / 360, hsv[1], hsv[2]])), { keepHue: true });
    });

    this.detailsEl = makeEl('div', ['a-color-picker__details', 'is-hidden'], { parent: this.el });
    this.colorBoxEl = makeEl('div', 'a-color-picker__color-box', { parent: this.detailsEl });
    this.colorThumbEl = makeEl('div', 'a-color-picker__color-thumb', { parent: this.colorBoxEl });

    this.hexEl = makeEl('div', ['a-color-picker__hex', 'a-text-input'], { parent: this.detailsEl });
    this.hexLabelEl = makeEl('div', 'a-text-input__label', { parent: this.hexEl, text: 'HEX' });
    this.hexInputEl = makeEl('input', 'a-text-input__input', { parent: this.hexEl });
    callbacks.listen(this.hexInputEl, 'input', () => {
      if (this.hexInputEl.value.match(/^#[0-9A-Fa-f]{6}$/)) {
        this.selectColor(this.hexInputEl.value);
      }
    });

    this.rgbEl = makeEl('div', ['a-color-picker__rgb', 'a-text-input'], { parent: this.detailsEl });
    this.rgbLabelEl = makeEl('div', 'a-text-input__label', { parent: this.rgbEl, text: 'RGB' });
    this.rgbInputEl = makeEl('input', 'a-text-input__input', { parent: this.rgbEl });
    callbacks.listen(this.rgbInputEl, 'input', () => {
      if (this.rgbInputEl.value.match(/^\s*\d+\s*,\s*\d+\s*,\s*\d+\s*$/)) {
        const rgb = this.rgbInputEl.value.split(',').map(v => v.trim());
        this.selectColor(rgbToHex(rgb));
      }
    });

    callbacks.listen(this.customEl, 'click', () => {
      this.customEl.classList.toggle('is-active');
      this.hueInput.classList.toggle('is-hidden');
      this.detailsEl.classList.toggle('is-hidden');
      for (const { el } of this.colors) {
        el.classList.toggle('is-hidden');
      }
    });

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    callbacks.listen(this.colorThumbEl, 'pointerdown', this.onPointerDown);

    this.selectColor('#FFFFFF');
  }

  onPointerDown(ev) {
    this.drag = {
      x0: ev.clientX, y0: ev.clientY,
    }

    this.callbacks.listen(document, 'pointermove', this.onPointerMove);
    this.callbacks.listen(document, 'pointerup', this.onPointerUp);
  }

  onPointerMove(ev) {
    if (!this.drag) {
      return;
    }
    const rect = this.colorBoxEl.getBoundingClientRect();
    const w = this.colorBoxEl.offsetWidth - 20;
    const h = this.colorBoxEl.offsetHeight - 20;
    const x = Math.max(0, Math.min(w, ev.clientX - rect.left - 10));
    const y = Math.max(0, Math.min(h, ev.clientY - rect.top - 10));
    this.colorThumbEl.style.transform = `translate(${x}px, ${y}px)`;
    const hue = this.hueInput.value / 360;
    const sat = x / w;
    const val = 1 - y / h;
    this.selectColor(rgbToHex(hsvToRgb([hue, sat, val])), { keepHue: true });
  }

  onPointerUp(ev) {
    this.drag = false;
    this.callbacks.unlisten(document, 'pointermove', this.onPointerMove);
    this.callbacks.unlisten(document, 'pointerup', this.onPointerUp);
  }

  selectColor(newColor, { keepHue } = {}) {
    this.color = newColor;
    for (const { color, el } of this.colors) {
      el.classList.toggle('is-active', color == newColor);
    }
    const rgb = hexToRgb(newColor);
    const hsv = rgbToHsv(rgb);
    if (keepHue) {
      hsv[0] = this.hueInput.value / 360;
    } else {
      this.hueInput.value = hsv[0] * 360;
    }
    
    const w = 200 - 20;
    const h = 120 - 20;
    const x = hsv[1] * w;
    const y = (1 - hsv[2]) * h;
    this.colorThumbEl.style.transform = `translate(${x}px, ${y}px)`;

    const hueColor = rgbToHex(hsvToRgb([hsv[0], 1, 1]));
    this.hueInput.style.setProperty('--color', hueColor);
    this.colorBoxEl.style.setProperty('--hue', hueColor);
    this.colorThumbEl.style.setProperty('--color', newColor);
    this.colorThumbEl.style.setProperty('--border-color', getContrastColor(newColor));

    this.hexInputEl.value = newColor;
    this.rgbInputEl.value = rgb.join(', ');
    this.dispatchEvent(new Event('color'));
  }
}