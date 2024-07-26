import Button from './comps/button.js';
import SlidersTab from './tabs/slidersTab.js';
import CropTab from './tabs/cropTab.js';
import TextTab from './tabs/textTab.js';
import DrawTab from './tabs/drawTab.js';
import StickersTab from './tabs/stickersTab.js';
import { CallbackManager, makeEl } from './utils.js';
import AngleSlider from './comps/angleSlider.js';
import ImageController from './imageController.js';

export default class ImageEditor extends EventTarget {
  constructor({ parent, image, managers, changes }) {
    super();
    this.callbacks = new CallbackManager();
    this.el = makeEl('div', 'a-image-editor', { parent });
    this.mainEl = makeEl('div', 'a-image-editor__main', { parent: this.el });
    this.sideEl = makeEl('div', 'a-image-editor__side', { parent: this.el });
    this.confirmBtn = Button({ parent: this.el, classList: ['is-fab'], icon: 'check' });
    this.callbacks.listen(this.confirmBtn, 'click', this.confirm.bind(this));

    this.imageEl = makeEl('div', 'a-image-editor__image', { parent: this.mainEl });
    this.cropPanelEl = makeEl('div', ['a-image-editor__crop-panel', 'is-hidden'], { parent: this.mainEl });
    // this.canvasEl = makeEl('canvas', 'a-image-editor__canvas', { parent: this.mainEl });
    this.sideHeadEl = makeEl('div', 'a-image-editor__side-head', { parent: this.sideEl });
    this.sideTabsEl = makeEl('div', ['a-image-editor__side-tabs', 'a-tabs'], { parent: this.sideEl });
    this.sideTabBodyEl = makeEl('div', 'a-image-editor__side-tab-body', { parent: this.sideEl });
    
    this.controller = new ImageController({ el: this.imageEl, managers, callbacks: this.callbacks, saved: changes });

    this.rotateBtn = Button({ parent: this.cropPanelEl, icon: 'rotate' });
    this.callbacks.listen(this.rotateBtn, 'click', () => {
      this.controller.setCropRotation(this.controller.state.rotation + 90);
    });
    this.cropAngleEl = new AngleSlider({ parent: this.cropPanelEl, callbacks: this.callbacks });
    this.callbacks.listen(this.cropAngleEl, 'change', () => {
      this.controller.setCropAngle(this.cropAngleEl.angle);
    });
    this.flipBtn = Button({ parent: this.cropPanelEl, icon: 'flip' });
    this.callbacks.listen(this.flipBtn, 'click', () => {
      this.controller.setCropFlip(!this.controller.state.flip);
    });

    this.closeBtn = Button({ parent: this.sideHeadEl, icon: 'close' });
    this.callbacks.listen(this.closeBtn, 'click', () => {
      this.dismiss();
      this.dispatchEvent(new Event('cancel'));
    });
    this.sideTitleEl = makeEl('div', 'a-image-editor__side-title', { parent: this.sideHeadEl, text: 'Edit' });
    this.undoBtn = Button({ parent: this.sideHeadEl, icon: 'undo', classList: ['is-disabled'] });
    this.callbacks.listen(this.undoBtn, 'click', () => {
      this.controller.undo();
    });
    this.redoBtn = Button({ parent: this.sideHeadEl, icon: 'redo', classList: ['is-disabled'] });
    this.callbacks.listen(this.redoBtn, 'click', () => {
      this.controller.redo();
    });
    this.callbacks.listen(this.controller, 'undostate', () => {
      this.undoBtn.classList.toggle('is-disabled', !this.controller.isUndoAvailable());
      this.redoBtn.classList.toggle('is-disabled', !this.controller.isRedoAvailable());
    });

    this.tabs = [
      new SlidersTab({ parent: this.sideTabBodyEl, controller: this.controller, callbacks: this.callbacks }),
      new CropTab({ parent: this.sideTabBodyEl, controller: this.controller, callbacks: this.callbacks }),
      new TextTab({ parent: this.sideTabBodyEl, controller: this.controller, callbacks: this.callbacks }),
      new DrawTab({ parent: this.sideTabBodyEl, controller: this.controller, callbacks: this.callbacks }),
      new StickersTab({ parent: this.sideTabBodyEl, controller: this.controller, managers, callbacks: this.callbacks }),
    ];
    this.sideTabsEl.append(...this.tabs.map(tab => tab.tabEl));
    this.selectedTab = null;
    this.selectTab(0);
    this.tabs.forEach((tab, index) => {
      this.callbacks.listen(tab.tabEl, 'click', () => {
        this.selectTab(index);
      });
    });

    image && this.controller.loadImage(image);
    this.undoBtn.classList.toggle('is-disabled', !this.controller.isUndoAvailable());
    this.redoBtn.classList.toggle('is-disabled', !this.controller.isRedoAvailable());
  }

  dismiss() { // TODO: animate & remove listeners
    this.controller.destroy();
    this.callbacks.destroy();
    for (const tab of this.tabs) {
      tab.destroy();
    }
    this.el.remove();
  }

  async confirm() {
    const ev = new Event('confirm');
    ev.image = await this.controller.renderFinalImage();
    ev.changes = this.controller.saveState();
    this.dismiss();
    this.dispatchEvent(ev);
  }

  selectTab(newIndex) {
    if (this.selectedTab === newIndex) {
      return;
    }
    if (this.selectedTab !== null) {
      this.tabs[this.selectedTab].closed();
    }
    this.selectedTab = newIndex;
    this.controller.setMode(['adjust', 'crop', 'text', 'draw', 'sticker'][newIndex]);
    const parentRect = this.sideTabsEl.getBoundingClientRect();
    const rect = this.tabs[newIndex].tabEl.getBoundingClientRect();
    this.sideTabsEl.style.setProperty('--highlight-left', rect.left - parentRect.left + 12);
    this.tabs[newIndex].el.scrollIntoView({ inline: 'start' });
    this.tabs.forEach((tab, index) => {
      tab.tabEl.classList.toggle('is-active', index == newIndex);
    });
    this.cropPanelEl.classList.toggle('is-hidden', newIndex != 1);
    this.tabs[this.selectedTab].opened();
  }
}