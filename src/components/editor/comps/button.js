import { makeEl } from '../utils.js';
import icons from './icons.js';

export default function Button({ parent, icon, classList } = {}) {
  const el = makeEl('div', 'a-button' + (classList ? ' ' + classList.join(' ') : ''), { parent, html: icons[icon] });
  return el;
}