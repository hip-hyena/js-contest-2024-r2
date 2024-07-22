import { makeEl } from '../utils.js';
import icons from './icons.js';

export default function ListItem({ parent, text, icon, iconClass }) {
  const el = makeEl('div', 'a-list-item', { parent });
  if (icon) {
    const iconEl = makeEl('div', 'a-list-item__icon' + (iconClass ? ' ' + iconClass.join(' ') : ''), { parent: el, html: icons[icon] });
  }
  const textEl = makeEl('div', 'a-list-item__text', { parent: el, text });
  return el;
}