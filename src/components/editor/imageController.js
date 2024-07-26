import ImageAdjuster from './imageAdjuster.js';
import { addStackedRects, distance, fitCubicBezier, getContrastColor, hexToRgb, interpolatePoint, rgbToHex, simplify } from './utils.js';
import wrapSticker from '../wrappers/sticker.ts';
import createMiddleware from '../../helpers/solid/createMiddleware.ts';

function waitForImage(img) {
  return new Promise((resolve) => {
    if (img.tagName == 'IMG') {
      img.onload = resolve;
    } else {
      resolve();
    }
  });
}
export default class ImageController extends EventTarget {
  constructor({ el, managers, callbacks, saved }) {
    super();
    this.el = el;
    this.managers = managers;
    this.callbacks = callbacks;
    this.canvasEl = document.createElement('canvas');
    this.maskCanvas = document.createElement('canvas');
    this.blurCanvas = document.createElement('canvas');
    this.textareaEl = document.createElement('textarea');
    this.textareaEl.classList.add('a-image-editor__textarea', 'is-hidden');
    this.textareaEl.cols = 1;
    this.ctx = this.canvasEl.getContext('2d');
    this.maskCtx = this.maskCanvas.getContext('2d');
    this.blurCtx = this.blurCanvas.getContext('2d');
    this.el.append(this.canvasEl);
    this.el.append(this.textareaEl);
    new ResizeObserver(() => {
      const dp = window.devicePixelRatio;
      this.viewWidth = dp * this.el.offsetWidth;
      this.viewHeight = dp * this.el.offsetHeight;
      this.canvasEl.width = this.viewWidth;
      this.canvasEl.height = this.viewHeight;
      this.canvasEl.style.transform = `scale(${1 / dp})`;
      this.maskCanvas.width = this.viewWidth;
      this.maskCanvas.height = this.viewHeight;
      this.maskCanvas.style.transform = `scale(${1 / dp})`;
      this.blurCanvas.width = this.viewWidth;
      this.blurCanvas.height = this.viewHeight;
      this.blurCanvas.style.transform = `scale(${1 / dp})`;
      this.redraw();
    }).observe(this.el);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onTextareaInput = this.onTextareaInput.bind(this);
    callbacks.listen(this.canvasEl, 'pointerdown', this.onPointerDown);
    callbacks.listen(this.canvasEl, 'pointermove', this.onPointerMove);
    callbacks.listen(this.textareaEl, 'input', this.onTextareaInput);
    this.drag = false;

    this.state = saved?.state || {
      adjustments: {},
      rotation: 0,
      angle: 0,
      flip: 0,
      crop: [0, 0, 0, 0],
    };
    this.overlays = saved?.overlays || []; // Part of state, but stored separately
    this.history = saved?.history || [[0, JSON.stringify(this.state)]]; // History of all committed changes
    this.undoStep = saved?.undoStep || 0;

    this.mode = 'adjust';

    this.cropAspect = 0;

    this.drawColor = {
      pen: '#FE4438',
      arrow: '#FFD60A',
      brush: '#FF8901',
      neon: '#62E5E0',
    };
    this.drawTool = 'pen';
    this.drawSize = 15;
    this.drawOverlay = null;

    this.textColor = '#FFFFFF';
    this.textSize = 24;
    this.textFont = 'Roboto';
    this.textAlign = 'center';
    this.textStyle = 'none';
    this.textOverlay = null;

    this.stickerOverlay = null;

    
    this.snappedX = false;
    this.snappedY = false;
    this._cropAnim = 0;

    let debounceTimer;
    this.commitDebounced = (arg) => {
      this.callbacks.clearTimeout(debounceTimer);
      debounceTimer = this.callbacks.timeout(() => {
        this.commit(arg);
      }, 1000);
    };
  }

  saveState() {
    return {
      state: this.state,
      overlays: this.overlays,
      history: this.history,
      undoStep: this.undoStep,
    }
  }

  destroy() {
    this.destroyed = true;
  }

  onTextareaInput() {
    this.textareaEl.style.width = 0;
    this.textareaEl.style.width = this.textareaEl.scrollWidth + 'px';
    this.textareaEl.style.height = 0;
    this.textareaEl.style.height = this.textareaEl.scrollHeight + 'px';
    if (!this.textOverlay) {
      return;
    }
    this.textOverlay.text = this.textareaEl.value;
    this.textOverlay.width = this.clientSizeToImage(this.textareaEl.scrollWidth);
    this.textOverlay.height = this.clientSizeToImage(this.textareaEl.scrollHeight);
    this.commitDebounced();
    this.redraw();
  }

  setCropAspect(aspect) {
    this.cropAspect = aspect;
    
    // TODO: re-crop better
    aspect = aspect == -1 ? this.imageWidth / this.imageHeight : aspect;
    if (aspect) {
      const w = this.imageWidth - this.state.crop[0] - this.state.crop[2];
      const h = w / aspect;
      this.state.crop[1] = (this.imageHeight - h) / 2;
      this.state.crop[3] = (this.imageHeight - h) / 2;
    }

    this.commit();
    this.redraw();
  }
  setCropRotation(rotation) {
    this.state.rotation = rotation;
    this.commit();
    this.redraw();
  }
  setCropAngle(angle) {
    this.state.angle = angle;
    this.commit();
    this.redraw();
  }
  setCropFlip(flip) {
    this.state.flip = flip;
    this.commit();
    this.redraw();
  }
  setMode(newMode) {
    this.mode = newMode;
    this.drawOverlay = null;
    this.textOverlay = null;
    this.stickerOverlay = null;
    this.canvasEl.style.cursor = newMode == 'text' ? 'text' : 'default';
    this.updateTextarea();
    this.redraw();

    this._cropAnimNext = newMode == 'crop' ? 1 : 0;
    if (this._cropAnim != this._cropAnimNext) {
      this.callbacks.clearInterval(this._cropTimer);
      const step = this._cropAnim < this._cropAnimNext ? 0.1 : -0.1;
      this._cropTimer = this.callbacks.interval(() => {
        this._cropAnim += step;
        if ((step > 0 && this._cropAnim >= this._cropAnimNext) || (step < 0 && this._cropAnim <= this._cropAnimNext)) {
          this._cropAnim = this._cropAnimNext;
          this.callbacks.clearInterval(this._cropAnim);
        }
        this.redraw();
      }, 16);
    }
  }
  setTextStyle(newStyle) {
    this.textStyle = newStyle;
    if (this.textOverlay) {
      const old = JSON.stringify(this.textOverlay);
      this.textOverlay.style = newStyle;
      this.commit([2, JSON.stringify(this.textOverlay), this.overlays.indexOf(this.textOverlay), old]);
    }
    this.updateTextarea();
    this.redraw();
  }
  setTextColor(newColor) {
    this.textColor = newColor;
    if (this.textOverlay) {
      const old = JSON.stringify(this.textOverlay);
      this.textOverlay.color = newColor;
      this.commit([2, JSON.stringify(this.textOverlay), this.overlays.indexOf(this.textOverlay), old]);
    }
    this.updateTextarea();
    this.redraw();
  }
  setTextFont(newFont) {
    this.textFont = newFont;
    if (this.textOverlay) {
      const old = JSON.stringify(this.textOverlay);
      this.textOverlay.font = newFont;
      this.commit([2, JSON.stringify(this.textOverlay), this.overlays.indexOf(this.textOverlay), old]);
    }
    this.updateTextarea();
    this.redraw();
  }
  setTextSize(newSize) {
    this.textSize = newSize;
    if (this.textOverlay) {
      const old = JSON.stringify(this.textOverlay);
      this.textOverlay.size = newSize;
      this.commitDebounced([2, JSON.stringify(this.textOverlay), this.overlays.indexOf(this.textOverlay), old]);
    }
    this.updateTextarea();
    this.redraw();
  }
  setTextAlign(newAlign) {
    this.textAlign = newAlign;
    if (this.textOverlay) {
      const old = JSON.stringify(this.textOverlay);
      this.textOverlay.align = newAlign;
      this.commit([2, JSON.stringify(this.textOverlay), this.overlays.indexOf(this.textOverlay), old]);
    }
    this.updateTextarea();
    this.redraw();
  }
  setDrawColor(newColor) {
    if (this.drawTool in this.drawColor) {
      this.drawColor[this.drawTool] = newColor;
    }
  }

  async loadSticker(docId) {
    const div = document.createElement('div');
    const loadPromises = [];
    wrapSticker({
      doc: await this.managers.appDocsManager.getDoc(docId),
      div,
      middleware: createMiddleware().get(),
      loadPromises,
      width: 256,
      height: 256
    });
    await Promise.all(loadPromises);
    return div.firstChild;
  }

  async addSticker(docId) {
    const image = await this.loadSticker(docId);
    await waitForImage(image);
    const width = image.width || image.naturalWidth;
    const height = image.height || image.naturalHeight;
    const cropWidth = this.imageWidth - (this.state.crop[0] + this.state.crop[2]);
    const cropHeight = this.imageHeight - (this.state.crop[1] + this.state.crop[3]);
    const midx = this.imageWidth / 2 + (this.state.crop[0] - this.state.crop[2]) / 2;
    const midy = this.imageHeight / 2 + (this.state.crop[1] - this.state.crop[3]) / 2;
    const size = Math.min(256, Math.min(cropWidth, cropHeight) * 0.3);
    const scale = size / Math.max(width, height);
    this.stickerOverlay = {
      type: 'sticker',
      image,
      center: [midx, midy],
      width,
      height,
      scale,
      angle: 0,
    };
    this.overlays.push(this.stickerOverlay);
    this.commit([1, JSON.stringify(
      Object.assign({}, this.stickerOverlay, { image: docId }),
    )]);
    this.redraw();
  }

  onPointerDown(ev) {
    this.overlayDragged = false;
    const hit = this.hitTest(...this.clientToImage(ev.clientX, ev.clientY));
    this.drag = {
      hit,
      crop0: this.state.crop.slice(0),
      x0: ev.clientX, y0: ev.clientY,
    }
    if (!hit && this.mode == 'crop') {
      this.canvasEl.style.cursor = 'move';
    }
    if (this.mode == 'draw') {
      this.drawOverlay = {
        type: this.drawTool,
        size: this.drawSize,
        points: [this.clientToImage(ev.clientX, ev.clientY)],
        bezier: null,
      }
      if (this.drawColor[this.drawTool]) {
        this.drawOverlay.color = this.drawColor[this.drawTool];
      }
      this.overlays.push(this.drawOverlay);
    } else
    if (hit && (hit.type == 'select')) {
      if (this.mode == 'text') {
        this.selectText(hit.overlay, true);
      } else {
        this.stickerOverlay = hit.overlay;
      }
      this.drag.center0 = hit.overlay.center.slice(0);
    }
    if (hit && hit.type == 'corner') {
      this.drag.angle0 = hit.overlay.angle;
    }
    if (hit && (hit.type == 'corner' || hit.type == 'select')) {
      const { image, ...props } = hit.overlay;
      this.drag.old = JSON.stringify(props);
    }
    this.callbacks.listen(document, 'pointerup', this.onPointerUp);
    this.redraw();
  }

  updateTextarea() {
    const textOverlay = this.textOverlay;
    this.textareaEl.classList.toggle('is-hidden', !textOverlay || !!this.drag);
    if (textOverlay && !this.drag) {
      const center = this.imageToClient(...textOverlay.center);
      this.textareaEl.className = `a-image-editor__textarea is-${textOverlay.align}-aligned`;
      this.textareaEl.style.left = center[0] + 'px';
      this.textareaEl.style.top = center[1] + 'px';
      this.textareaEl.style.transform = `translate(-50%, -50%) rotate(${textOverlay.angle * 180 / Math.PI}deg)`;
      this.textareaEl.style.fontFamily = textOverlay.font;
      this.textareaEl.style.fontSize = this.imageSizeToClient(textOverlay.size) + 'px';
      this.textareaEl.style.caretColor = textOverlay.style == 'fill' ? getContrastColor(textOverlay.color) : textOverlay.color;
      this.textareaEl.style.textAlign = textOverlay.align;
      //this.textareaEl.style.width = this.imageSizeToClient(textOverlay.width) + 'px';
      this.textareaEl.style.width = 0;
      this.textareaEl.style.width = this.textareaEl.scrollWidth + 'px';
      this.textareaEl.style.height = 0;
      this.textareaEl.style.height = this.textareaEl.scrollHeight + 'px';
      textOverlay.width = this.clientSizeToImage(this.textareaEl.scrollWidth);
      textOverlay.height = this.clientSizeToImage(this.textareaEl.scrollHeight);
    }
  }

  selectText(textOverlay, unfocused) {
    this.textOverlay = textOverlay;
    this.textareaEl.value = textOverlay.text;
    this.updateTextarea();
    !unfocused && this.textareaEl.focus();
    this.dispatchEvent(new Event('textselect'));
  }

  onPointerUp(ev) {
    // commit
    if (this.mode == 'crop') {
      this.commit();
    }
    if (this.drag && this.drag.hit && (this.drag.hit.type == 'select' || this.drag.hit.type == 'corner')) {
      if (this.overlayDragged) {
        const overlay = this.textOverlay || this.stickerOverlay;
        const { image, ...props } = overlay;
        this.commit([2, JSON.stringify(props), this.overlays.indexOf(overlay), this.drag.old]);
      }
    }
    if (this.drag && this.drag.hit && this.drag.hit.type == 'select') {
      this.drag = false;
      this.textOverlay && this.selectText(this.textOverlay);
    } else
    if (this.mode == 'text' && (!this.drag || !this.drag.hit)) {
      this.drag = false;
      this.textOverlay = {
        type: 'text',
        color: this.textColor,
        font: this.textFont,
        size: this.textSize,
        align: this.textAlign,
        style: this.textStyle,
        text: '',
        center: this.clientToImage(ev.clientX, ev.clientY),
        width: this.imageWidth / 3,
        scale: 1,
        angle: 0,
      };
      this.overlays.push(this.textOverlay);
      this.selectText(this.textOverlay);
      this.commit([1, JSON.stringify(this.textOverlay)]);
    }
    if (this.drawOverlay) {
      const overlay = this.drawOverlay;
      const t0 = Date.now();
      console.log(`${overlay.points.length} points`);
      // Step 1: Use Ramer-Douglas-Peucker to reduce number of points (no more than 300)
      let eps = 0.005;
      overlay.points = simplify(overlay.points, eps);
      console.log(`${overlay.points.length} after simplification`);
      while (overlay.points.length > 500) {
        eps *= 2;
        overlay.points = simplify(overlay.points, eps);
        console.log(`${overlay.points.length} after simplification`);
      }
      console.log(`Simplification took ${Date.now() - t0} ms`);
      // Step 2: Approximate points with bezier curves
      if (overlay.type == 'arrow') {
        const last = overlay.points[overlay.points.length - 1];
        let mid;
        let len = 0;
        for (let i = 1; i < overlay.points.length; i++) {
          len += distance(overlay.points[i - 1], overlay.points[i]) + 1e-5;
        }
        len = Math.min(overlay.size * 3.5, len * 0.4);
        for (let i = overlay.points.length - 1; i >= 1; i--) {
          const dist = distance(overlay.points[i - 1], overlay.points[i]) + 1e-5;
          if (len < dist) {
            mid = interpolatePoint(overlay.points[i - 1], overlay.points[i], len / dist);
            overlay.points = overlay.points.slice(0, i).concat([mid, last]);
            break;
          }
          len -= dist;
        }
        overlay.bezier = fitCubicBezier(this.drawOverlay.points.slice(0, -1), 15);
        overlay.bezier.push([mid, last]);
      } else {
        overlay.bezier = fitCubicBezier(this.drawOverlay.points, overlay.type == 'brush' ? 3 : 5);
      }
      // Each stroke should contain 300 points + 300 bezier curves at most
      console.log(`Processed in ${Date.now() - t0} ms`);
      if (overlay._first) { // Small hack to preserve first stroke orientation
        overlay.first = overlay._first;
        delete overlay._first;
      }
      this.commit([1, JSON.stringify(overlay)]);
    }
    this.drag = false;
    this.drawOverlay = null;
    this.callbacks.unlisten(document, 'pointerup', this.onPointerUp);
    this.updateCursor(ev);
    this.redraw();
  }

  updateCursor(ev) {
    const hit = this.hitTest(...this.clientToImage(ev.clientX, ev.clientY));
    if (hit && hit.type == 'corner') {
      this.canvasEl.style.cursor = 'default';
    } else
    if (hit && (hit.anchor == 'top-left' || hit.anchor == 'bottom-right')) {
      this.canvasEl.style.cursor = 'nwse-resize';
    } else
    if (hit && (hit.anchor == 'bottom-left' || hit.anchor == 'top-right')) {
      this.canvasEl.style.cursor = 'nesw-resize';
    } else
    if (hit && (hit.type == 'select')) {
      this.canvasEl.style.cursor = (this.textOverlay == hit.overlay || this.stickerOverlay == hit.overlay) ? 'move' : 'default';
    } else {

      this.canvasEl.style.cursor = (this.mode == 'text' || this.mode == 'draw' ? 'crosshair' : 'default');
    }
  }

  onPointerMove(ev) {
    this.snappedX = false;
    this.snappedY = false;
    if (!this.drag) {
      this.updateCursor(ev);
    } else {
      const pos0 = this.clientToImage(this.drag.x0, this.drag.y0);
      const pos = this.clientToImage(ev.clientX, ev.clientY);
      const dx = pos[0] - pos0[0];
      const dy = pos[1] - pos0[1];
      const aspect = this.cropAspect == -1 ? this.imageWidth / this.imageHeight : this.cropAspect;
      if (this.mode == 'crop' && !this.drag.hit) {
        this.state.crop[0] = this.drag.crop0[0] + dx;
        this.state.crop[1] = this.drag.crop0[1] + dy;
        this.state.crop[2] = this.drag.crop0[2] - dx;
        this.state.crop[3] = this.drag.crop0[3] - dy;
      } else
      if (this.drag.hit && this.drag.hit.type == 'crop') {
        if (this.drag.hit.anchor == 'top-left') {
          this.state.crop[0] = this.drag.crop0[0] + dx;
          this.state.crop[1] = this.drag.crop0[1] + dy;
        } else
        if (this.drag.hit.anchor == 'top-right') {
          this.state.crop[2] = this.drag.crop0[2] - dx;
          this.state.crop[1] = this.drag.crop0[1] + dy;
        } else
        if (this.drag.hit.anchor == 'bottom-left') {
          this.state.crop[0] = this.drag.crop0[0] + dx;
          this.state.crop[3] = this.drag.crop0[3] - dy;
        } else
        if (this.drag.hit.anchor == 'bottom-right') {
          this.state.crop[2] = this.drag.crop0[2] - dx;
          this.state.crop[3] = this.drag.crop0[3] - dy;
        }
        if (aspect) {
          const w = this.imageWidth - this.state.crop[0] - this.state.crop[2];
          const h = w / aspect;
          if (this.drag.hit.anchor == 'top-left' || this.drag.hit.anchor == 'top-right') {
            this.state.crop[1] = this.imageHeight - this.state.crop[3] - h;
          } else {
            this.state.crop[3] = this.imageHeight - this.state.crop[1] - h;
          }
        }
      } else
      if (this.drag.hit && this.drag.hit.type == 'corner') {
        const overlay = this.drag.hit.overlay;
        const angle0 = Math.atan2(pos0[0] - overlay.center[0], pos0[1] - overlay.center[1]);
        const angle = Math.atan2(pos[0] - overlay.center[0], pos[1] - overlay.center[1]);
        overlay.angle = this.drag.angle0 - (angle - angle0);
        this.updateTextarea();
        this.overlayDragged = true;
      } else
      if (this.drag.hit && this.drag.hit.type == 'select') {
        const minSnapDist = 10;
        const overlay = this.drag.hit.overlay;
        overlay.center[0] = this.drag.center0[0] + dx;
        const midx = this.imageWidth / 2 + (this.state.crop[0] - this.state.crop[2]) / 2;
        if (Math.abs(overlay.center[0] - midx) < minSnapDist) {
          overlay.center[0] = midx;
          this.snappedX = midx;
        }
        overlay.center[1] = this.drag.center0[1] + dy;
        
        const offsy = overlay.type == 'text' ? overlay.size * 0.3 : 0;
        const midy = this.imageHeight / 2 + (this.state.crop[1] - this.state.crop[3]) / 2;
        if (Math.abs(overlay.center[1] - offsy - midy) < minSnapDist) {
          overlay.center[1] = midy + offsy;
          this.snappedY = midy;
        }
        this.updateTextarea();

        this.overlayDragged = true;
      } else
      if (this.drawOverlay) {
        this.drawOverlay.points.push(this.clientToImage(ev.clientX, ev.clientY));
      }
    }
    this.redraw();
  }

  hitTest(x, y) {
    const distTo = (x0, y0) => (x - x0) * (x - x0) + (y - y0) * (y - y0);
    const rot = (center, angle) => {
      const d = Math.sqrt(distTo(center[0], center[1]));
      const a = Math.atan2(y - center[1], x - center[0]);
      return [
        center[0] + d * Math.cos(a - angle),
        center[1] + d * Math.sin(a - angle)
      ];
    }
    const rotDistTo = (x0, y0, center, angle) => {
      const [rx, ry] = rot(center, angle);
      return (rx - x0) * (rx - x0) + (ry - y0) * (ry - y0);
    }
    const minDist = 5 * 5;

    if (this.mode == 'crop') {
      if (distTo(this.state.crop[0], this.state.crop[1]) < minDist) {
        return { type: 'crop', anchor: 'top-left' };
      }
      if (distTo(this.imageWidth - this.state.crop[2], this.state.crop[1]) < minDist) {
        return { type: 'crop', anchor: 'top-right' };
      }
      if (distTo(this.state.crop[0], this.imageHeight - this.state.crop[3]) < minDist) {
        return { type: 'crop', anchor: 'bottom-left' };
      }
      if (distTo(this.imageWidth - this.state.crop[2], this.imageHeight - this.state.crop[3]) < minDist) {
        return { type: 'crop', anchor: 'bottom-right' };
      }
      return null;
    }

    for (const overlay of this.overlays) {
      if (overlay.type != this.mode) {
        continue;
      }
      if (overlay.type != 'text' && overlay.type != 'sticker') {
        continue;
      }
      const offsy = overlay.type == 'text' ? overlay.size * 0.3 : 0;
      const padx = overlay.type == 'text' ? overlay.size * 0.5 : 0;
      const pady = overlay.type == 'text' ? overlay.size * 0.25 : 0;
      const x0 = overlay.center[0] - padx - overlay.width * overlay.scale / 2;
      const x1 = overlay.center[0] + padx + overlay.width * overlay.scale / 2;
      const y0 = overlay.center[1] - offsy - pady - overlay.height * overlay.scale / 2;
      const y1 = overlay.center[1] - offsy + pady + overlay.height * overlay.scale / 2;
      if (overlay === this.textOverlay || overlay === this.stickerOverlay) {
        if (rotDistTo(x0, y0, overlay.center, overlay.angle) < minDist) {
          return { type: 'corner', anchor: 'top-left', overlay };
        }
        if (rotDistTo(x1, y0, overlay.center, overlay.angle) < minDist) {
          return { type: 'corner', anchor: 'top-right', overlay };
        }
        if (rotDistTo(x0, y1, overlay.center, overlay.angle) < minDist) {
          return { type: 'corner', anchor: 'bottom-left', overlay };
        }
        if (rotDistTo(x1, y1, overlay.center, overlay.angle) < minDist) {
          return { type: 'corner', anchor: 'bottom-right', overlay };
        }
      }
      const [rx, ry] = rot(overlay.center, overlay.angle);
      if (rx < x0 || rx > x1 || ry < y0 || ry > y1) {
        continue;
      }
      return { type: 'select', overlay };
    }
    return null;
  }

  getImageScale() {
    const clientWidth = this.el.clientWidth - (this.mode == 'crop' ? 120 : 0);
    const clientHeight = this.el.clientHeight - (this.mode == 'crop' ? 180 : 0);

    const cropWidth = this.imageWidth - (this.mode != 'crop' ? this.state.crop[0] + this.state.crop[2] : 0);
    const cropHeight = this.imageHeight - (this.mode != 'crop' ?  this.state.crop[1] + this.state.crop[3] : 0) ;
    
    return Math.min(clientWidth / cropWidth, clientHeight / cropHeight);
  }
  clientToImage(x, y) {
    const cropWidth = this.imageWidth - (this.mode != 'crop' ? this.state.crop[0] + this.state.crop[2] : 0);
    const cropHeight = this.imageHeight - (this.mode != 'crop' ?  this.state.crop[1] + this.state.crop[3] : 0);
    
    const scale = this.getImageScale();
    const ox = this.mode != 'crop' ? this.state.crop[0] : 0;
    const oy = this.mode != 'crop' ? this.state.crop[1] : 0;
    
    x = (x - this.el.clientLeft) - this.el.clientWidth * 0.5;
    y = (y - this.el.clientTop) - this.el.clientHeight * 0.5 + (this.mode == 'crop' ? 30 : 0);
    return [x / scale + cropWidth * 0.5 + ox, y / scale + cropHeight * 0.5 + oy];
  }
  imageToClient(x, y) {
    const cropWidth = this.imageWidth - (this.mode != 'crop' ? this.state.crop[0] + this.state.crop[2] : 0);
    const cropHeight = this.imageHeight - (this.mode != 'crop' ?  this.state.crop[1] + this.state.crop[3] : 0) ;
    const scale = this.getImageScale();

    const ox = this.mode != 'crop' ? this.state.crop[0] : 0;
    const oy = this.mode != 'crop' ? this.state.crop[1] : 0;
    
    x = (x - cropWidth * 0.5 - ox) * scale;
    y = (y - cropHeight * 0.5 - oy) * scale;
    return [x + this.el.clientWidth * 0.5 + this.el.clientLeft, y + this.el.clientHeight * 0.5 + this.el.clientTop];
  }
  clientSizeToImage(size) {
    const scale = this.getImageScale();
    return size / scale;
  }
  imageSizeToClient(size) {
    const scale = this.getImageScale();
    return size * scale;
  }

  async loadImage(image) {
    image = await image;
    this.image = image;
    this.imageWidth = image.width;
    this.imageHeight = image.height;
    this.adjuster = new ImageAdjuster({ image });
    //this.el.append(this.adjuster.canvas);
    this.adjuster.apply(this.state.adjustments);
    window.adjuster = this.adjuster;
    this.redraw();
  }

  redraw(targetCtx, cropped) {
    if (!this.image || !this.adjuster || this.destroyed) {
      return;
    }
    const ctx = targetCtx || this.ctx;
    const dp = window.devicePixelRatio;
    const cropWidth = this.imageWidth - (this.mode != 'crop' || cropped ? this.state.crop[0] + this.state.crop[2] : 0);
    const cropHeight = this.imageHeight - (this.mode != 'crop' || cropped ?  this.state.crop[1] + this.state.crop[3] : 0) ;
    let viewScale = cropped ? 1 : Math.min(
      this.viewWidth / cropWidth,
      this.viewHeight / cropHeight
    );
    let viewCenter = cropped ? [cropWidth / 2, cropHeight / 2] : [this.viewWidth / 2, this.viewHeight / 2];
    const padViewScale = Math.min((this.viewWidth - 120 * dp) / this.imageWidth, (this.viewHeight - 180 * dp) / this.imageHeight);
    const padViewCenter = [viewCenter[0], viewCenter[1] - 30 * dp];

    // Animate
    if (!cropped) {
      viewScale = viewScale * (1 - this._cropAnim) + padViewScale * this._cropAnim;
      viewCenter = [
        viewCenter[0] * (1 - this._cropAnim) + padViewCenter[0] * this._cropAnim,
        viewCenter[1] * (1 - this._cropAnim) + padViewCenter[1] * this._cropAnim
      ];
    }

    const resetContext = (ctx) => {
      if (ctx.reset) {
        ctx.reset();
        return;
      }
      ctx.resetTransform();
      ctx.clearRect(0, 0, this.viewWidth, this.viewHeight);
    }
    const initContext = (ctx) => {
      //ctx.clearRect(0, 0, this.viewWidth, this.viewHeight);
      ctx.save();
      ctx.translate(viewCenter[0], viewCenter[1]);
      ctx.scale(viewScale, viewScale);

      if (this.mode != 'crop' && !cropped) {
        ctx.beginPath();
        ctx.rect(- cropWidth / 2, - cropHeight / 2,
          this.imageWidth - this.state.crop[0] - this.state.crop[2],
          this.imageHeight - this.state.crop[1] - this.state.crop[3]);
        ctx.clip();
        //ctx.translate(this.state.crop[0], this.state.crop[1]);
      }


      ctx.save();
      ctx.translate(
        - cropWidth / 2 - (this.mode != 'crop' || cropped ? this.state.crop[0] : 0),
        - cropHeight / 2 - (this.mode != 'crop' || cropped ? this.state.crop[1] : 0)
      );
    }
    const drawBackground = (ctx, op = 'destination-atop') => {
      ctx.save();
      ctx.rotate((this.state.rotation + this.state.angle) * Math.PI / 180);
      //ctx.translate(- this.imageWidth / 2, - this.imageHeight / 2);
      if (!this.state.flip) { // for some reason images already flipped
        //ctx.translate(cropWidth / 2, cropWidth/2);
        ctx.scale(-1, 1);
        //ctx.translate(-cropWidth / 2, -cropWidth/2);
      }
      ctx.translate(
        - cropWidth / 2 - (this.mode != 'crop' || cropped ? (this.state.flip ? this.state.crop[2] : this.state.crop[0]) : 0),
        - cropHeight / 2 - (this.mode != 'crop' || cropped ? this.state.crop[1] : 0)
      );
      ctx.globalCompositeOperation = op;
      ctx.drawImage(this.adjuster.canvas, 0, 0);
      ctx.restore();
    }

    /*const overlays = this.overlays;
    for (let i = overlays.length - 1; i >= 0; i--) {
      const overlay = overlays[i];
      if (overlay.type == 'eraser') {
        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = overlay.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (const pt of overlay.points) {
          ctx.lineTo(pt[0], pt[1]);
        }
        ctx.stroke();
        ctx.clip();
      }
    }*/

    resetContext(ctx);
    initContext(ctx);
    
    // Snapping guidelines
    if (!cropped) {
      ctx.strokeStyle = '#4fc1ff';
      ctx.lineWidth = 1;
      if (this.snappedX !== false) {
        ctx.beginPath();
        ctx.moveTo(this.snappedX, 0);
        ctx.lineTo(this.snappedX, this.imageHeight);
        ctx.stroke();
      }
      if (this.snappedY !== false) {
        ctx.beginPath();
        ctx.moveTo(0, this.snappedY);
        ctx.lineTo(this.imageWidth, this.snappedY);
        ctx.stroke();
      }
    }

    for (const overlay of this.overlays) {
      ctx.save();
      if (overlay.type == 'text') {
        ctx.translate(overlay.center[0], overlay.center[1]);
        ctx.rotate(overlay.angle);
        ctx.translate(-overlay.center[0], -overlay.center[1]);
        ctx.font = `${overlay.font == 'Courier New' || overlay.font == 'Typewriter' ? 'bold' : 500} ${overlay.size}px ${overlay.font}`;
        ctx.textAlign = overlay.align;
        const lines = overlay.text.split('\n');
        const lineHeight = overlay.height / lines.length;
        const x = overlay.center[0] + (overlay.align == 'left' ?
          -overlay.width * 0.5 : (overlay.align == 'right' ? overlay.width * 0.5 : 0)
        )
        if (overlay.style == 'stroke') {
          ctx.strokeStyle = getContrastColor(overlay.color);
          ctx.lineWidth = overlay.size * 0.2;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          for (let i = 0; i < lines.length; i++) {
            ctx.strokeText(lines[i], x, overlay.center[1] - overlay.height * 0.5 + lineHeight * (i + 0.5));
          }
          ctx.fillStyle = overlay.color;
        } else
        if (overlay.style == 'fill') {
          ctx.fillStyle = overlay.color;
          ctx.beginPath();
          const rects = [];
          for (let i = 0; i < lines.length; i++) {
            const size = ctx.measureText(lines[i]);
            let x = overlay.center[0] - overlay.width * 0.5 - overlay.size * 0.35;
            const width = size.width + overlay.size * 0.75;
            if (overlay.align == 'center') {
              x += (overlay.width - size.width) * 0.5;
            } else
            if (overlay.align == 'right') {
              x += overlay.width - size.width;
            }
            const y = overlay.center[1] - overlay.height * 0.5 + lineHeight * (i + 0.5);
            rects.push([x, y - lineHeight * 0.76, width, lineHeight]);
          }
          addStackedRects(ctx, rects, overlay.size * 0.5);
          ctx.fill();
          ctx.fillStyle = getContrastColor(overlay.color);
        } else {
          ctx.fillStyle = overlay.color;
        }
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], x, overlay.center[1] - overlay.height * 0.5 + lineHeight * (i + 0.5));
        }
      } else
      if (overlay.type == 'sticker') {
        ctx.translate(overlay.center[0], overlay.center[1]);
        ctx.rotate(overlay.angle);
        ctx.translate(-overlay.center[0], -overlay.center[1]);
        ctx.drawImage(overlay.image,
          overlay.center[0] - overlay.width * overlay.scale / 2,
          overlay.center[1] - overlay.height * overlay.scale / 2,
          overlay.width * overlay.scale, overlay.height * overlay.scale
        );
      } else
      if (overlay.type == 'brush') {
        const sz = overlay.size;
        const angles = [];
        const k = 0.995;
        if (overlay.first) {
          angles.push(overlay.first);
        } else {
          let fx = 0;
          let fy = 0;
          const num = Math.min(20, overlay.points.length);
          for (let i = 1; i < num; i++) {
            const st = overlay.points[i - 1];
            const en = overlay.points[i];
            let dx = en[0] - st[0];
            let dy = en[1] - st[1];
            const d = Math.sqrt(dx * dx + dy * dy);
            fx += dx / d;
            fy += dy / d;
          }
          fx /= num;
          fy /= num;
          angles.push([Math.atan2(fy, fx), fx, fy]);
          overlay._first = [Math.atan2(fy, fx), fx, fy];
        }

        const segments = overlay.bezier || [];
        if (!segments.length) {
          for (let i = 1; i < overlay.points.length; i++) {
            segments.push([overlay.points[i - 1], overlay.points[i]]);
          }
        }

        for (let i = 1; i < segments.length; i++) {
          const st = segments[i][0];
          const en = segments[i][1];
          let dx = en[0] - st[0];
          let dy = en[1] - st[1];
          const d = Math.sqrt(dx * dx + dy * dy);
          const prev = angles[angles.length - 1];
          dx = (dx / d) * (1 - k) + prev[1] * k;
          dy = (dy / d) * (1 - k) + prev[2] * k;
          angles.push([Math.atan2(dy, dx), dx, dy]);
        }
        
        ctx.fillStyle = overlay.color;
        ctx.strokeStyle = overlay.color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = overlay.size / 4;
        for (let i = 0; i < segments.length; i++) {
          const st = segments[i][0];
          const en = segments[i][1];
          const angle = angles[i][0];
          const al = angle + Math.PI / 2;
          const ar = angle - Math.PI / 2;
          let dx = sz * 0.5 * Math.cos(al);
          let dy = sz * 0.5 * Math.sin(al);
          ctx.beginPath();
          ctx.moveTo(st[0] + dx, st[1] + dy);
          if (segments[i].length == 2) {
            ctx.lineTo(en[0] + dx, en[1] + dy);
          } else {
            ctx.bezierCurveTo(
              segments[i][2][0] + dx, segments[i][2][1] + dy,
              segments[i][3][0] + dx, segments[i][3][1] + dy,
              en[0] + dx, en[1] + dy
            )
          }
          dx = sz * 0.5 * Math.cos(ar);
          dy = sz * 0.5 * Math.sin(ar);
          ctx.lineTo(en[0] + dx, en[1] + dy);
          if (segments[i].length == 2) {
            ctx.lineTo(st[0] + dx, st[1] + dy);
          } else {
            ctx.bezierCurveTo(
              segments[i][3][0] + dx, segments[i][3][1] + dy,
              segments[i][2][0] + dx, segments[i][2][1] + dy,
              st[0] + dx, st[1] + dy
            )
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      } else {
        let ctx = targetCtx || this.ctx;
        if (overlay.type == 'blur') {
          ctx = this.blurCtx;
          resetContext(ctx);
          initContext(ctx);
          // Transfer currently drawn image to the blur canvas
          ctx.filter = `blur(${overlay.size}px)`;
          ctx.save();
          ctx.resetTransform();
          ctx.drawImage(this.canvasEl, 0, 0);
          ctx.restore();
          ctx.restore();
          ctx.filter = `blur(${overlay.size}px)`;
          drawBackground(ctx);
          ctx.restore();

          initContext(ctx);
          ctx.globalCompositeOperation = 'destination-in';
          ctx.strokeStyle = '#000';
        } else
        if (overlay.type == 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.strokeStyle = '#000';
        } else
        if (overlay.type == 'neon') {
          ctx.shadowBlur = overlay.size;
          ctx.shadowColor = overlay.color;
          ctx.strokeStyle = rgbToHex(hexToRgb(overlay.color).map(v => v + 100));
        } else {
          ctx.strokeStyle = overlay.color;
        }
        ctx.lineWidth = overlay.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        //console.log(bezier);
        ctx.beginPath();
        if (overlay.bezier && overlay.bezier.length) {
          ctx.moveTo(overlay.bezier[0][0][0], overlay.bezier[0][0][1]);
          for (const pt of overlay.bezier) {
            if (pt.length == 2) {
              ctx.lineTo(pt[1][0], pt[1][1]);
            } else {
              ctx.bezierCurveTo(pt[2][0], pt[2][1], pt[3][0], pt[3][1], pt[1][0], pt[1][1]);
            }
          }
        } else {
          for (const pt of overlay.points) {
            ctx.lineTo(pt[0], pt[1]);
          }
        }
        if (overlay.type == 'arrow' && overlay.points.length > 1 && this.drawOverlay !== overlay) {
          const last = overlay.points[overlay.points.length - 1];
          const prev = overlay.points[overlay.points.length - 2];
          const len = distance(last, prev) * 1.2;
          const angle = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
          const spread = 0.4;
          ctx.moveTo(last[0], last[1]);
          ctx.lineTo(last[0] - len * Math.cos(angle + spread), last[1] - len * Math.sin(angle + spread));
          ctx.moveTo(last[0], last[1]);
          ctx.lineTo(last[0] - len * Math.cos(angle - spread), last[1] - len * Math.sin(angle - spread));
        }
        ctx.stroke();

        if (overlay.type == 'blur') {
          // Transfer currently drawn image to the blur canvas (but only at masked regions)
          ctx.restore();
          ctx.restore();
          //ctx.filter = 'blur(50px)';

          // Render blurred image back to the main canvas
          const trgCtx = targetCtx || this.ctx;
          trgCtx.save();
          trgCtx.resetTransform();
          trgCtx.drawImage(this.blurCanvas, 0, 0);
          trgCtx.restore();
        }
      }
      ctx.restore();

      // Draw control handles
      if (!cropped && (overlay == this.textOverlay || overlay == this.stickerOverlay)) {
        ctx.save();
        ctx.translate(overlay.center[0], overlay.center[1]);
        ctx.rotate(overlay.angle);
        ctx.translate(-overlay.center[0], -overlay.center[1]);
        ctx.strokeStyle = '#fff';
        ctx.globalAlpha = 0.3;
        ctx.setLineDash([2, 5]);
        const offsy = overlay.type == 'text' ? overlay.size * 0.3 : 0;
        const padx = overlay.type == 'text' ? overlay.size * 0.5 : 0;
        const pady = overlay.type == 'text' ? overlay.size * 0.25 : 0;
        const x0 = overlay.center[0] - overlay.width * overlay.scale / 2 - padx;
        const y0 = overlay.center[1] - overlay.height * overlay.scale / 2 - offsy - pady;
        const w = overlay.width * overlay.scale + padx * 2;
        const h = overlay.height * overlay.scale + pady * 2;
        ctx.strokeRect(x0, y0, w, h);
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(x0, y0, 4, 0, 2 * Math.PI, false);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x0 + w, y0, 4, 0, 2 * Math.PI, false);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x0, y0 + h, 4, 0, 2 * Math.PI, false);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x0 + w, y0 + h, 4, 0, 2 * Math.PI, false);
        ctx.fill();
        ctx.restore();
      }
    }


    ctx.restore();
    drawBackground(ctx);
    ctx.restore();
    if (this.mode == 'crop' && !cropped) {
      ctx.save();
      
      ctx.translate(viewCenter[0], viewCenter[1]);
      ctx.scale(viewScale, viewScale);
      ctx.translate(- this.imageWidth / 2, - this.imageHeight / 2);
      
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.33;
      ctx.beginPath();
      const x0 = this.state.crop[0];
      const y0 = this.state.crop[1];
      const w = this.imageWidth - this.state.crop[0] - this.state.crop[2];
      const h = this.imageHeight - this.state.crop[1] - this.state.crop[3];
      ctx.rect(x0, y0, w, h);
      ctx.moveTo(x0 + w * 1/3, y0);
      ctx.lineTo(x0 + w * 1/3, y0 + h);
      ctx.moveTo(x0 + w * 2/3, y0);
      ctx.lineTo(x0 + w * 2/3, y0 + h);
      ctx.moveTo(x0, y0 + h * 1/3);
      ctx.lineTo(x0 + w, y0 + h * 1/3);
      ctx.moveTo(x0, y0 + h * 2/3);
      ctx.lineTo(x0 + w, y0 + h * 2/3);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x0, y0, 4, 0, 2 * Math.PI, false);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x0 + w, y0, 4, 0, 2 * Math.PI, false);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x0, y0 + h, 4, 0, 2 * Math.PI, false);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x0 + w, y0 + h, 4, 0, 2 * Math.PI, false);
      ctx.fill();
      ctx.restore();
    }
  }

  renderFinalImage() {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = this.imageWidth - this.state.crop[0] - this.state.crop[2];
      canvas.height = this.imageHeight - this.state.crop[1] - this.state.crop[3];
      const ctx = canvas.getContext('2d');
      this.redraw(ctx, true);
      canvas.toBlob((blob) => {
        resolve({
          blob,
          url: URL.createObjectURL(blob),
          // url: canvas.toDataURL('image/jpeg', 1),
          size: {
            width: canvas.width,
            height: canvas.height,
          }
        });
      }, 'image/jpeg');
    });
  }

  change(diff) {
    Object.assign(this.state.adjustments, diff);
    this.adjuster && this.adjuster.apply(this.state.adjustments);
    this.redraw();
  }

  commit(step) {
    if (this.undoStep) {
      // Cut off history
      this.history = this.history.slice(0, this.history.length - this.undoStep);
      this.undoStep = 0;
    }
    this.history.push(step || [0, JSON.stringify(this.state)]);
    this.dispatchEvent(new Event('undostate'));
  }

  undo() {
    if (!this.isUndoAvailable()) {
      return; // Nothing to undo
    }
    const last = this.history[this.history.length - this.undoStep - 1];
    this.undoStep += 1;
    if (last[0] == 0) { // Snapshot of state object; it's small so we always store it as a full object
      for (let i = this.history.length - this.undoStep - 1; i >= 0; i--) {
        if (this.history[i][0] == 0) { // Previous snapshot found; restore
          this.state = JSON.parse(this.history[i][1]);
          break;
        }
      }
    } else
    if (last[0] == 1) { // A new overlay was added; just pop it from list
      this.overlays.pop();
    } else
    if (last[0] == 2) { // Overlay changed
      this.overlays[last[2]] = Object.assign(this.overlays[last[2]], JSON.parse(last[3]));
    }
    this.adjuster && this.adjuster.apply(this.state.adjustments);
    this.textareaEl.classList.add('is-hidden');
    this.textOverlay = null;
    this.drawOverlay = null;
    this.dispatchEvent(new Event('change'));
    this.dispatchEvent(new Event('undostate'));
    this.redraw();
  }

  async redo() {
    if (!this.isRedoAvailable()) {
      return; // Nothing to redo
    }
    this.undoStep -= 1;
    const step = this.history[this.history.length - this.undoStep - 1];
    if (step[0] == 0) { // Snapshot
      this.state = JSON.parse(step[1]);
    } else
    if (step[0] == 1) { // A new overlay; just push it to the overlays
      const overlay = JSON.parse(step[1]);
      if (overlay.type == 'sticker') {
        overlay.image = await this.loadSticker(overlay.image);
      }
      this.overlays.push(overlay);
    } else
    if (step[0] == 2) { // Overlay changed
      this.overlays[step[2]] = Object.assign(this.overlays[step[2]], JSON.parse(step[1]));
    }
    this.adjuster && this.adjuster.apply(this.state.adjustments);
    this.textareaEl.classList.add('is-hidden');
    this.textOverlay = null;
    this.drawOverlay = null;
    this.dispatchEvent(new Event('change'));
    this.dispatchEvent(new Event('undostate'));
    this.redraw();
  }

  isUndoAvailable() {
    return this.undoStep < this.history.length - 1;
  }

  isRedoAvailable() {
    return this.undoStep > 0;
  }
}