import Button from '../comps/button.js';
import ColorPicker from '../comps/colorPicker.js';
import ListItem from '../comps/listItem.js';
import Slider from '../comps/slider.js';
import { makeEl } from '../utils.js';
import Tab from './tab.js';

export default class TextTab extends Tab {
  constructor(opts) {
    super(opts);
    this.tabEl = Button({ icon: 'text' });
    this.el = makeEl('div', ['a-tab', 'is-text'], { parent: opts.parent, callbacks: opts.callbacks });

    this.colorPicker = new ColorPicker({ parent: this.el, callbacks: opts.callbacks });
    opts.callbacks.listen(this.colorPicker, 'color', () => {
      this.sizeSlider.el.style.setProperty('--color', this.colorPicker.color);
      this.controller.setTextColor(this.colorPicker.color);
    });

    this.buttonsEl = makeEl('div', 'a-text-tab__buttons', { parent: this.el });
    this.leftBtn = Button({ parent: this.buttonsEl, icon: 'align_left' });
    this.centerBtn = Button({ parent: this.buttonsEl, icon: 'align_center', classList: ['is-active'] });
    this.rightBtn = Button({ parent: this.buttonsEl, icon: 'align_right' });
    [[this.leftBtn, 'left'], [this.centerBtn, 'center'], [this.rightBtn, 'right']].forEach(([btn, key]) => {
      opts.callbacks.listen(btn, 'click', () => {
        for (const el of [this.leftBtn, this.centerBtn, this.rightBtn]) {
          el.classList.toggle('is-active', el === btn);
        }
        this.controller.setTextAlign(key);
      });
    });
    this.fillerEl = makeEl('div', 'a-text-tab__filler', { parent: this.buttonsEl });
    this.styleNone = Button({ parent: this.buttonsEl, icon: 'text_none', classList: ['is-active'] });
    this.styleStroke = Button({ parent: this.buttonsEl, icon: 'text_stroke' });
    this.styleFill = Button({ parent: this.buttonsEl, icon: 'text_fill' });
    [[this.styleNone, 'none'], [this.styleStroke, 'stroke'], [this.styleFill, 'fill']].forEach(([btn, key]) => {
      opts.callbacks.listen(btn, 'click', () => {
        for (const el of [this.styleNone, this.styleStroke, this.styleFill]) {
          el.classList.toggle('is-active', el === btn);
        }
        this.controller.setTextStyle(key);
      });
    });

    this.sizeSlider = new Slider({ parent: this.el, label: 'Size', min: 248, max: 548, value: 317, isExponential: true, noInitial: true, callbacks: opts.callbacks });
    opts.callbacks.listen(this.sizeSlider.inputEl, 'input', () => {
      this.controller.setTextSize(this.sizeSlider.getActualValue());
    });
    this.sizeSlider.el.style.setProperty('--color', this.colorPicker.color);
    this.sizeSlider.el.style.marginBottom = '-6px';
    this.fontEl = makeEl('div', 'a-section-title', { parent: this.el, text: 'Font' });

    this.fontItems = ['Roboto', 'Typewriter', 'Avenir Next', 'Courier New',
      'Noteworthy', 'Georgia', 'Papyrus', 'Snell Roundhand'].map(fontName => {
        const el = ListItem({ parent: this.el, text: fontName });
        el.style.fontFamily = fontName;
        el.style.fontWeight = fontName == 'Courier New' ? 'bold' : 500;
        opts.callbacks.listen(el, 'click', this.selectFont.bind(this, fontName));
        return { key: fontName, el };
      });
    this.selectFont('Roboto');

    opts.callbacks.listen(this.controller, 'textselect', () => {
      for (const [el, style] of [[this.styleNone, 'none'], [this.styleStroke, 'stroke'], [this.styleFill, 'fill']]) {
        el.classList.toggle('is-active', style == this.controller.textOverlay.style);
      }
      for (const [el, align] of [[this.leftBtn, 'left'], [this.centerBtn, 'center'], [this.rightBtn, 'right']]) {
        el.classList.toggle('is-active', align == this.controller.textOverlay.align);
      }
      for (const { key, el } of this.fontItems) {
        el.classList.toggle('is-active', key == this.controller.textOverlay.font);
      }
      this.sizeSlider.setActualValue(this.controller.textOverlay.size);
      this.colorPicker.selectColor(this.controller.textOverlay.color);

    });
  }

  selectFont(newFont) {
    for (const { key, el } of this.fontItems) {
      el.classList.toggle('is-active', key == newFont);
    }
    this.controller.setTextFont(newFont);
  }
}