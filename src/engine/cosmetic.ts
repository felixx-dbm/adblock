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
  // Raw JS rules (`#%#(()=>{...})()`). MV3 only allows running these from files shipped with the extension.
  scripts: string[];
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
    if (!this.engine) return { css: [], extCss: [], countSelector: null, scriptlets: [], scripts: [] };

    const request = new Request(url, null, RequestType.Document);
    const option = this.engine.matchRequest(request).getCosmeticOption();
    const result = this.engine.getCosmeticResult(request, option);
    const { elementHiding, CSS } = result;

    const countSelector = elementHiding.specific.slice(0, MAX_COUNTED_SELECTORS).map(raw).join(', ');
    const scriptRules = result.getScriptRules();
    const scriptlets = scriptRules
      .map((rule) => rule.getScriptletData())
      .filter((data): data is ScriptletData => data !== null);
    const scripts = scriptRules.filter((rule) => rule.getScriptletData() === null).map(raw);

    return {
      css: [...elementHiding.generic, ...elementHiding.specific].map(hide).concat(
        [...CSS.generic, ...CSS.specific].map(raw),
      ),
      extCss: [...elementHiding.genericExtCss, ...elementHiding.specificExtCss].map(hide).concat(
        [...CSS.genericExtCss, ...CSS.specificExtCss].map(raw),
      ),
      countSelector: countSelector === '' ? null : countSelector,
      scriptlets,
      scripts,
    };
  }
}
