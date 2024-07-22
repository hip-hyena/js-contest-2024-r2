import Button from '../comps/button.js';
import { makeEl } from '../utils.js';
import Tab from './tab.js';

export default class StickersTab extends Tab {
  constructor(opts) {
    super(opts);
    this.tabEl = Button({ icon: 'smile' });
    this.el = makeEl('div', 'a-tab', { parent: opts.parent });
  }
}