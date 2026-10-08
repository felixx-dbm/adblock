import {
  CosmeticOption,
  Engine,
  Request,
  RequestType,
  setConfiguration,
  type CosmeticRule,
  type ScriptletData,
} from '@adguard/tsurlfilter';

setConfiguration({ engine: 'extension', version: '0.1.0', verbose: false });

export interface FilterSource {
  id: number;
  content: string;
}

export interface CosmeticPayload {
  css: string[];
  extCss: string[];
  countSelector: string | null;
  scriptlets: ScriptletData[];
}

const MAX_COUNTED_SELECTORS = 200;

const hide = (rule: CosmeticRule): string => `${rule.getContent()} { display: none !important; }`;
const raw = (rule: CosmeticRule): string => rule.getContent();

export class CosmeticEngine {
  private engine: Engine | null = null;

  load(sources: FilterSource[]): void {
    this.engine = Engine.createSync({ filters: sources.map(({ id, content }) => ({ id, content })) });
  }

  getPayload(url: string): CosmeticPayload {
    if (!this.engine) return { css: [], extCss: [], countSelector: null, scriptlets: [] };

    const request = new Request(url, null, RequestType.Document);
    const option = this.engine.matchRequest(request).getCosmeticOption();
    const result = this.engine.getCosmeticResult(request, option);
    const { elementHiding, CSS } = result;

    const countSelector = elementHiding.specific.slice(0, MAX_COUNTED_SELECTORS).map(raw).join(', ');
    const scriptlets = result
      .getScriptRules()
      .map((rule) => rule.getScriptletData())
      .filter((data): data is ScriptletData => data !== null);

    return {
      css: [...elementHiding.generic, ...elementHiding.specific].map(hide).concat(
        [...CSS.generic, ...CSS.specific].map(raw),
      ),
      extCss: [...elementHiding.genericExtCss, ...elementHiding.specificExtCss].map(hide).concat(
        [...CSS.genericExtCss, ...CSS.specificExtCss].map(raw),
      ),
      countSelector: countSelector === '' ? null : countSelector,
      scriptlets,
    };
  }
}
