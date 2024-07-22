import Button from '../comps/button.js';
import ColorPicker from '../comps/colorPicker.js';
import ListItem from '../comps/listItem.js';
import Slider from '../comps/slider.js';
import { makeEl } from '../utils.js';
import Tab from './tab.js';

export default class DrawTab extends Tab {
  constructor(opts) {
    super(opts);
    this.tabEl = Button({ icon: 'draw' });
    this.el = makeEl('div', ['a-tab', 'is-draw'], { parent: opts.parent });

    this.colorPicker = new ColorPicker({ parent: this.el });
    this.colorPicker.selectColor('#FE4438');
    this.colorPicker.addEventListener('color', () => {
      this.sizeSlider.el.style.setProperty('--color', this.colorPicker.color);
      for (const { key, el} of this.toolItems) {
        if (key == this.controller.drawTool) {
          el.style.setProperty('--color', this.colorPicker.color);
        }
      }
      this.controller.setDrawColor(this.colorPicker.color);
    });
    this.sizeSlider = new Slider({ parent: this.el, label: 'Size', min: 5, max: 50, value: 15, noInitial: true });
    this.sizeSlider.inputEl.addEventListener('input', () => {
      this.controller.drawSize = this.sizeSlider.inputEl.value;
    });
    this.sizeSlider.el.style.setProperty('--color', this.colorPicker.color);
    this.sizeSlider.el.style.marginBottom = '-6px';
    this.toolEl = makeEl('div', 'a-section-title', { parent: this.el, text: 'Tool' });

    this.toolItems = ['pen', 'arrow', 'brush', 'neon', 'blur', 'eraser'].map(key => { 
      const el = ListItem({ parent: this.el, text: key[0].toUpperCase() + key.substring(1), icon: `tool_${key}` });
      el.classList.add('is-draw-tool');
      if (key in this.controller.drawColor) {
        el.style.setProperty('--color', this.controller.drawColor[key]);
      }
      el.addEventListener('click', this.selectTool.bind(this, key));
      return { key, el };
    });
    this.selectTool('pen');
  }

  selectTool(newTool) {
    for (const { key, el } of this.toolItems) {
      el.classList.toggle('is-active', key == newTool);
    }
    this.controller.drawTool = newTool;
    if (newTool in this.controller.drawColor) {
      this.colorPicker.selectColor(this.controller.drawColor[newTool]);
      this.colorPicker.el.classList.remove('is-hidden');
    } else {
      this.colorPicker.el.classList.add('is-hidden');
    }
  }
}