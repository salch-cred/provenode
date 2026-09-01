/**
 * Regression: the landing page must not scroll itself.
 *
 * Root cause this guards against — the CLI terminal mock types 12 lines into a
 * <pre> that had `min-height: 180px` and `white-space: pre-wrap`. As the text
 * grew past that height the box expanded (~180px -> ~285px). Because the growth
 * happens above the reader's position, the browser keeps scrollY fixed and
 * pushes later sections down, which presents as "the page jumped upward".
 *
 * These are static assertions over the stylesheet rather than a browser test,
 * so they run in CI with no Chrome dependency.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const cssRaw = readFileSync(new URL('../src/styles/landing.css', import.meta.url), 'utf8');
const tsx = readFileSync(new URL('../src/pages/Landing.tsx', import.meta.url), 'utf8');

// Strip comments before matching. The explanatory comment on the fix quotes the
// old buggy `min-height: 180px`, which would otherwise be matched as a real
// declaration — the first version of this test failed for exactly that reason.
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '');

/** Extract the body of the first rule matching a selector. */
function ruleBody(selector) {
  const i = css.indexOf(selector + ' {');
  if (i === -1) return null;
  const open = css.indexOf('{', i);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

describe('landing page layout stability', () => {
  it('reserves the terminal height in em so it cannot grow while typing', () => {
    const body = ruleBody('.lp-terminal-body');
    expect(body).toBeTruthy();

    // A pixel min-height is the bug: it cannot track the mobile font-size and
    // was smaller than the final content.
    const minHeight = /min-height:\s*([\d.]+)(px|em|rem)/.exec(body);
    expect(minHeight, '.lp-terminal-body must declare a min-height').toBeTruthy();
    expect(minHeight[2], 'min-height must be em-relative, not px').toBe('em');

    // 12 lines at line-height 1.9 => 22.8em. Anything less lets the box grow.
    const lineHeight = parseFloat(/line-height:\s*([\d.]+)/.exec(body)[1]);
    const lineCount = (tsx.match(/^\s+'(\$ provenode|\s+ok|\s+\.\.|)/gm) || []).length;
    expect(lineHeight).toBeCloseTo(1.9, 2);
    expect(parseFloat(minHeight[1])).toBeGreaterThanOrEqual(12 * lineHeight);
  });

  it('does not let terminal lines wrap into extra rows', () => {
    const body = ruleBody('.lp-terminal-body');
    // `pre-wrap` would wrap long commands on narrow screens, producing more
    // than 12 rendered lines and defeating the reserved height.
    expect(body).not.toMatch(/white-space:\s*pre-wrap/);
    expect(body).toMatch(/white-space:\s*pre\b/);
  });

  it('keeps the em-based reservation at the mobile font size', () => {
    // The mobile override may change font-size/padding but must NOT reintroduce
    // a pixel min-height.
    const mobileOverrides = [...css.matchAll(/\.lp-terminal-body\s*\{([^}]*)\}/g)].map(m => m[1]);
    expect(mobileOverrides.length).toBeGreaterThan(1);
    for (const body of mobileOverrides.slice(1)) {
      expect(body, 'mobile override must not set a px min-height').not.toMatch(/min-height:\s*[\d.]+px/);
    }
  });

  it('opts self-animating regions out of scroll anchoring', () => {
    expect(css).toMatch(/overflow-anchor:\s*none/);
    // The animated regions that resize on their own.
    for (const sel of ['.lp-reveal', '.lp-float', '.lp-fill', '.lp-marquee-container']) {
      const anchorRule = new RegExp(`${sel.replace('.', '\\.')}[^{]*\\{[^}]*overflow-anchor:\\s*none`, 's');
      const inGroup = /overflow-anchor:\s*none/.test(css) &&
        new RegExp(`${sel.replace('.', '\\.')}[^{]*overflow-anchor`, 's').test(css);
      expect(anchorRule.test(css) || inGroup, `${sel} should opt out of scroll anchoring`).toBe(true);
    }
  });

  it('gives above-the-fold images explicit dimensions', () => {
    // An <img> without width/height reserves zero space until it loads, then
    // reflows the nav and pushes content down.
    const imgs = [...tsx.matchAll(/<img\s[^>]*\/>/g)].map(m => m[0]);
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(img, `img missing width/height: ${img}`).toMatch(/width=/);
      expect(img).toMatch(/height=/);
    }
  });

  it('never calls scrollTo or scrollIntoView on mount', () => {
    // Nothing in the landing page should move the viewport programmatically.
    expect(tsx).not.toMatch(/window\.scrollTo|scrollIntoView|scrollTop\s*=/);
  });

  it('typing animation appends text without touching layout above it', () => {
    // The animation must write into the <code> child, not replace the <pre>,
    // and must not insert elements that change the box model.
    expect(tsx).toMatch(/querySelector\('\.lp-terminal-text'\)/);
    expect(tsx).toMatch(/terminal\.textContent\s*=/);
    expect(tsx).not.toMatch(/terminal\.innerHTML\s*=/);
  });
});
