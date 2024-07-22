import Button from './comps/button.js';
import SlidersTab from './tabs/slidersTab.js';
import CropTab from './tabs/cropTab.js';
import TextTab from './tabs/textTab.js';
import DrawTab from './tabs/drawTab.js';
import StickersTab from './tabs/stickersTab.js';
import { makeEl } from './utils.js';
import AngleSlider from './comps/angleSlider.js';
import ImageController from './imageController.js';

export default class ImageEditor {
  constructor({ parent, image }) {
    this.el = makeEl('div', 'a-image-editor', { parent });
    this.mainEl = makeEl('div', 'a-image-editor__main', { parent: this.el });
    this.sideEl = makeEl('div', 'a-image-editor__side', { parent: this.el });
    this.confirmBtn = Button({ parent: this.el, classList: ['is-fab'], icon: 'check' });

    this.imageEl = makeEl('div', 'a-image-editor__image', { parent: this.mainEl });
    this.cropPanelEl = makeEl('div', ['a-image-editor__crop-panel', 'is-hidden'], { parent: this.mainEl });
    // this.canvasEl = makeEl('canvas', 'a-image-editor__canvas', { parent: this.mainEl });
    this.sideHeadEl = makeEl('div', 'a-image-editor__side-head', { parent: this.sideEl });
    this.sideTabsEl = makeEl('div', ['a-image-editor__side-tabs', 'a-tabs'], { parent: this.sideEl });
    this.sideTabBodyEl = makeEl('div', 'a-image-editor__side-tab-body', { parent: this.sideEl });
    
    this.controller = new ImageController({ el: this.imageEl });

    this.rotateBtn = Button({ parent: this.cropPanelEl, icon: 'rotate' });
    this.rotateBtn.addEventListener('click', () => {
      this.controller.setCropRotation(this.controller.state.rotation + 90);
    });
    this.cropAngleEl = new AngleSlider({ parent: this.cropPanelEl });
    this.cropAngleEl.addEventListener('change', () => {
      this.controller.setCropAngle(this.cropAngleEl.angle);
    });
    this.flipBtn = Button({ parent: this.cropPanelEl, icon: 'flip' });
    this.flipBtn.addEventListener('click', () => {
      this.controller.setCropFlip(!this.controller.state.flip);
    });

    this.closeBtn = Button({ parent: this.sideHeadEl, icon: 'close' });
    this.sideTitleEl = makeEl('div', 'a-image-editor__side-title', { parent: this.sideHeadEl, text: 'Edit' });
    this.undoBtn = Button({ parent: this.sideHeadEl, icon: 'undo', classList: ['is-disabled'] });
    this.undoBtn.addEventListener('click', () => {
      this.controller.undo();
    });
    this.redoBtn = Button({ parent: this.sideHeadEl, icon: 'redo', classList: ['is-disabled'] });
    this.redoBtn.addEventListener('click', () => {
      this.controller.redo();
    });
    this.controller.addEventListener('undostate', () => {
      this.undoBtn.classList.toggle('is-disabled', !this.controller.isUndoAvailable());
      this.redoBtn.classList.toggle('is-disabled', !this.controller.isRedoAvailable());
    });

    this.tabs = [
      new SlidersTab({ parent: this.sideTabBodyEl, controller: this.controller }),
      new CropTab({ parent: this.sideTabBodyEl, controller: this.controller }),
      new TextTab({ parent: this.sideTabBodyEl, controller: this.controller }),
      new DrawTab({ parent: this.sideTabBodyEl, controller: this.controller }),
      new StickersTab({ parent: this.sideTabBodyEl, controller: this.controller }),
    ];
    this.sideTabsEl.append(...this.tabs.map(tab => tab.tabEl));
    this.selectTab(0);
    this.tabs.forEach((tab, index) => {
      tab.tabEl.addEventListener('click', () => {
        this.selectTab(index);
      });
    });

    image && this.controller.loadImage(image);
  }

  selectTab(newIndex) {
    this.selectedTab = newIndex;
    this.controller.setMode(['adjust', 'crop', 'text', 'draw', 'stickers'][newIndex]);
    const parentRect = this.sideTabsEl.getBoundingClientRect();
    const rect = this.tabs[newIndex].tabEl.getBoundingClientRect();
    this.sideTabsEl.style.setProperty('--highlight-left', rect.left - parentRect.left + 12);
    this.tabs[newIndex].el.scrollIntoView(/*{ behavior: 'smooth' }*/);
    this.tabs.forEach((tab, index) => {
      tab.tabEl.classList.toggle('is-active', index == newIndex);
    });
    this.cropPanelEl.classList.toggle('is-hidden', newIndex != 1);
  }
}