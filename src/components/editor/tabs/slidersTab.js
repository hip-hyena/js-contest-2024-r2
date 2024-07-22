import Button from '../comps/button.js';
import Slider from '../comps/slider.js';
import { makeEl } from '../utils.js';
import Tab from './tab.js';

export default class SlidersTab extends Tab {
  constructor(opts) {
    super(opts);
    this.tabEl = Button({ icon: 'sliders' });
    this.el = makeEl('div', ['a-tab', 'is-sliders'], { parent: opts.parent });

    this.sliders = {};
    for (const { key, isCentered } of [
      { key: 'enhance' },
      { key: 'brightness', isCentered: true },
      { key: 'contrast', isCentered: true },
      { key: 'saturation', isCentered: true },
      { key: 'warmth', isCentered: true },
      { key: 'fade' },
      { key: 'highlights', isCentered: true },
      { key: 'shadows', isCentered: true },
      { key: 'vignette' },
      { key: 'grain' },
      { key: 'sharpen' },
    ]) {
      this.sliders[key] = new Slider({
        parent: this.el,
        value: 0,
        isCentered,
        label: key[0].toUpperCase() + key.substring(1)
      });

      ((key) => {
        let isChangedWithPointer = false;
        this.sliders[key].inputEl.addEventListener('input', () => {
          this.controller.change({ [key]: this.sliders[key].inputEl.value / 100 });
          if (!isChangedWithPointer) {
            this.controller.commitDebounced();
          }
        });
        this.sliders[key].inputEl.addEventListener('pointerdown', () => {
          isChangedWithPointer = true;
        });
        this.sliders[key].inputEl.addEventListener('pointerup', () => {
          if (isChangedWithPointer) {
            this.controller.commit();
          }
        });
      })(key);
    }

    this.controller.addEventListener('change', () => {
      for (const key in this.sliders) {
        this.sliders[key].setValue((this.controller.state.adjustments[key] || 0) * 100);
      }
    });
  }
}