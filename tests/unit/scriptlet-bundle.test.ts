import { describe, expect, it } from 'vitest';
import { bundleScriptlets } from '../../src/engine/scriptlet-bundle';

describe('bundleScriptlets', () => {
  it('runs raw JS rules and isolates a throwing rule from the rest', () => {
    const target: Record<string, unknown> = {};
    const code = bundleScriptlets([], ['throw new Error("boom");', '(()=>{target.ran=true})();']);
    new Function('target', code)(target);
    expect(target.ran).toBe(true);
  });
});
