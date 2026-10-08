import { convertCustomRules } from '../../shared/custom-rules';
import type { ListMeta } from '../../shared/lists';
import { send } from '../../shared/messages';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function renderErrors(): void {
  const { errors } = convertCustomRules($<HTMLTextAreaElement>('custom-rules').value);
  $('rule-errors').replaceChildren(
    ...errors.map(({ line, message }) => {
      const item = document.createElement('li');
      item.textContent = `Line ${line}: ${message}`;
      return item;
    }),
  );
}

async function main(): Promise<void> {
  const [meta, settings] = await Promise.all([
    fetch('rulesets/meta.json').then((response) => response.json() as Promise<ListMeta[]>),
    send({ type: 'getSettings' }),
  ]);

  $('lists').replaceChildren(
    ...meta.map(({ id, name, ruleCount }) => {
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.dataset.id = String(id);
      box.checked = settings.enabledLists.includes(id);
      const small = document.createElement('small');
      small.textContent = ` (${ruleCount.toLocaleString()} rules)`;
      label.append(box, ` ${name}`, small);
      return label;
    }),
  );

  $<HTMLTextAreaElement>('custom-rules').value = settings.customRules;
  $<HTMLTextAreaElement>('allowlist').value = settings.allowlist.join('\n');
  renderErrors();
  $('custom-rules').addEventListener('input', renderErrors);

  $('save').addEventListener('click', async () => {
    const enabledLists = [...document.querySelectorAll<HTMLInputElement>('#lists input')]
      .filter((box) => box.checked)
      .map((box) => Number(box.dataset.id));
    const allowlist = $<HTMLTextAreaElement>('allowlist')
      .value.split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const result = await send({
      type: 'updateSettings',
      patch: { enabledLists, allowlist, customRules: $<HTMLTextAreaElement>('custom-rules').value },
    });
    $('status').textContent = result.error ?? 'Saved';
  });
}

void main();
