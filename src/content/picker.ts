import { send } from '../shared/messages';

const SAFE_IDENT = /^[a-zA-Z][\w-]*$/;
const MAX_CLASS_LENGTH = 30;

const escapeIdent = (value: string): string => value.replace(/[^\w-]/g, '\\$&');

function segment(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const classes = [...element.classList]
    .filter((name) => SAFE_IDENT.test(name) && name.length <= MAX_CLASS_LENGTH && !/\d{3,}/.test(name))
    .map((name) => `.${escapeIdent(name)}`)
    .join('');
  const base = tag + classes;

  const parent = element.parentElement;
  if (!parent) return base;
  const matching = [...parent.children].filter((sibling) => sibling.matches(base));
  if (matching.length < 2) return base;
  const position = [...parent.children].filter((s) => s.tagName === element.tagName).indexOf(element) + 1;
  return `${base}:nth-of-type(${position})`;
}

export function generateSelector(element: Element): string {
  const doc = element.ownerDocument;
  const isUnique = (selector: string): boolean => doc.querySelectorAll(selector).length === 1;
  const parts: string[] = [];

  let node: Element | null = element;
  while (node && node !== doc.documentElement) {
    if (SAFE_IDENT.test(node.id) && isUnique(`#${escapeIdent(node.id)}`)) {
      parts.unshift(`#${escapeIdent(node.id)}`);
      return parts.join(' > ');
    }
    parts.unshift(segment(node));
    const selector = parts.join(' > ');
    if (isUnique(selector)) return selector;
    node = node.parentElement;
  }
  return parts.join(' > ');
}

function confirmHide(selector: string): void {
  const preview = document.createElement('style');
  preview.textContent = `${selector} { display: none !important; }`;
  document.documentElement.append(preview);

  const panel = document.createElement('div');
  panel.style.cssText =
    'all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#222;color:#fff;' +
    'font:13px system-ui;padding:10px 12px;border-radius:6px;display:flex;gap:8px;align-items:center';
  const label = document.createElement('code');
  label.textContent = selector;
  label.style.cssText = 'max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';

  const hide = document.createElement('button');
  hide.textContent = 'Hide';
  hide.dataset.adblockPicker = 'hide';
  hide.onclick = () => {
    void send({ type: 'addCosmeticRule', host: location.hostname, selector });
    panel.remove();
  };

  const undo = document.createElement('button');
  undo.textContent = 'Undo';
  undo.onclick = () => {
    preview.remove();
    panel.remove();
  };

  panel.append(label, hide, undo);
  document.documentElement.append(panel);
}

export function startPicker(): void {
  const highlight = document.createElement('div');
  highlight.style.cssText =
    'position:fixed;z-index:2147483647;pointer-events:none;background:rgba(255,0,0,.25);outline:2px solid red';
  document.documentElement.append(highlight);
  let target: Element | null = null;

  const onMove = (event: MouseEvent): void => {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (!element || element === highlight) return;
    target = element;
    const rect = element.getBoundingClientRect();
    Object.assign(highlight.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  };

  const stop = (): void => {
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    highlight.remove();
  };

  const onClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!target) return;
    const selector = generateSelector(target);
    stop();
    confirmHide(selector);
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') stop();
  };

  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
}
