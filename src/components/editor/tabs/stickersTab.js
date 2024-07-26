import Button from '../comps/button.js';
import { makeEl } from '../utils.js';
import Tab from './tab.js';
import StickersPane from '../../emoticonsDropdown/tabs/stickers.ts';
import { EmoticonsDropdown } from '../../emoticonsDropdown/index.ts';
import animationIntersector from '../../animationIntersector.ts';
import findUpTag from '../../../helpers/dom/findUpTag.ts';

export const EMOTICONSEDITORGROUP = 'emoticons-image-editor';
export default class StickersTab extends Tab {
  constructor(opts) {
    super(opts);
    this.tabEl = Button({ icon: 'smile' });
    this.el = makeEl('div', ['a-tab', 'is-stickers'], { parent: opts.parent });

    this.pane = new StickersPane(opts.managers);
    this.pane.setTyping = () => {}; // noop
    this.pane.emoticonsDropdown = new EmoticonsDropdown();
    this.pane.emoticonsDropdown.getElement = () => this.el;
    this.pane.emoticonsDropdown.onMediaClick = async (ev) => {
      const target = findUpTag(ev.target, 'DIV');
      if(!target) return false;
      this.controller.addSticker(target.dataset.docId);
    }
    this.pane.init();
    this.el.append(this.pane.container);
  }

  destroy() {
    this.pane.destroy();
  }
  opened() {
    //animationIntersector.unlockIntersectionGroup(EMOTICONSEDITORGROUP);
    this.pane.emoticonsDropdown.lazyLoadQueue.unlockAndRefresh();
    this.pane.onOpened();
  }
  closed() {
    //animationIntersector.lockIntersectionGroup(EMOTICONSEDITORGROUP);
    //animationIntersector.checkAnimations(true, EMOTICONSEDITORGROUP);
    this.pane.emoticonsDropdown.lazyLoadQueue.lock();
    this.pane.onClosed();
  }
}