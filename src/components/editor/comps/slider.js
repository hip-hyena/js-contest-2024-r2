import { makeEl } from '../utils.js';

export default class Slider {
  constructor({ parent, label, value, min, max, isCentered, isExponential, noInitial }) {
    this.el = makeEl('div', 'a-slider' + (isCentered ? ' is-centered' : ''), { parent });
    this.labelEl = makeEl('div', 'a-slider__label', { parent: this.el, text: label });
    this.valueEl = makeEl('div', 'a-slider__value', { parent: this.el });
    this.inputEl = makeEl('input', 'a-slider__input', { parent: this.el });
    this.inputEl.type = 'range';
    this.isExponential = isExponential;
    this.inputEl.min = min === undefined ? (isCentered ? -100 : 0) : min;
    this.inputEl.max = max === undefined ? 100 : max;
    this.inputEl.addEventListener('input', () => {
      this.setValue(this.inputEl.value);
    });
    this.initialValue = noInitial ? null : value;
    noInitial && this.el.classList.add('is-changed');
    this.setValue(value || 0);
  }

  getActualValue() {
    return this.isExponential ? Math.round(Math.exp(this.inputEl.value / 100)) : this.inputEl.value;
  }

  setActualValue(value) {
    this.setValue(this.isExponential ? Math.log(value) * 100 : value);
  }

  setValue(value) {
    this.inputEl.value = value;
    this.valueEl.textContent = this.getActualValue();
    this.el.style.setProperty('--value', (this.inputEl.value - this.inputEl.min) / (this.inputEl.max - this.inputEl.min));
    this.el.classList.toggle('is-changed', value != this.initialValue);
  }
}