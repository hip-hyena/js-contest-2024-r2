import Button from '../comps/button.js';
import ListItem from '../comps/listItem.js';
import { makeEl } from '../utils.js';
import Tab from './tab.js';

export default class CropTab extends Tab {
  constructor(opts) {
    super(opts);
    this.tabEl = Button({ icon: 'crop' });
    this.el = makeEl('div', 'a-tab', { parent: opts.parent });

    this.titleEl = makeEl('div', 'a-section-title', { parent: this.el, text: 'Aspect ratio' });
    this.items = [
      { key: 'free', icon: 'aspect_free', value: 0 },
      { key: 'original', icon: 'aspect_original', value: -1 },
      { key: 'square', icon: 'aspect_square', value: 1 },
      { key: '3:2', icon: 'aspect_3_2', isHalfWidth: true, value: 3/2 },
      { key: '2:3', icon: 'aspect_3_2', isHalfWidth: true, isRotated: true, value: 2/3 },
      { key: '4:3', icon: 'aspect_4_3', isHalfWidth: true, value: 4/3 },
      { key: '3:4', icon: 'aspect_4_3', isHalfWidth: true, isRotated: true, value: 3/4 },
      { key: '5:4', icon: 'aspect_5_4', isHalfWidth: true, value: 5/4 },
      { key: '4:5', icon: 'aspect_5_4', isHalfWidth: true, isRotated: true, value: 4/5 },
      { key: '7:5', icon: 'aspect_7_5', isHalfWidth: true, value: 7/5 },
      { key: '5:7', icon: 'aspect_7_5', isHalfWidth: true, isRotated: true, value: 5/7 },
      { key: '16:9', icon: 'aspect_16_9', isHalfWidth: true, value: 16/9 },
      { key: '9:16', icon: 'aspect_16_9', isHalfWidth: true, isRotated: true, value: 9/16 },
    ].map(({ key, icon, isHalfWidth, isRotated, value }) => {
      const el = ListItem({ parent: this.el, text: key[0].toUpperCase() + key.substring(1), icon, iconClass: isRotated ? ['is-rotated90'] : null });
      if (isHalfWidth) {
        el.classList.add('is-half-width');
      }
      if (this.controller.cropAspect == value) {
        el.classList.add('is-active');
      }
      opts.callbacks.listen(el, 'click', () => {
        this.controller.setCropAspect(value);
        for (const item of this.items) {
          item.el.classList.toggle('is-active', item.value == value);
        }
      });
      return { key, el, value };
    });
  }
}