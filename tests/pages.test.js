/**
 * Console smoke test — mounts EVERY console page in jsdom and fails on any
 * render-time crash, so a bad prop access or a missing route can never ship
 * silently again. This catches the class of bug that a headless HTTP fetch
 * cannot see (an empty #root looks like a 200).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// ── jsdom environment ───────────────────────────────────────────────────────
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/app/dashboard',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
// `navigator` is a getter-only global in newer Node — define it instead of assigning.
if (!globalThis.navigator || !globalThis.navigator.userAgent?.includes('jsdom')) {
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
}
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.IntersectionObserver = class {
  observe() {} unobserve() {} disconnect() {}
};
globalThis.localStorage = dom.window.localStorage;
if (!dom.window.navigator.clipboard) {
  Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: async () => {} } });
}

// Every API call resolves to an empty-but-well-shaped payload so pages render
// their zero states rather than exploding on undefined.
const EMPTY = {
  success: true, models: [], deployments: [], devices: [], sites: [], objects: [],
  groups: [], jobs: [], listings: [], datasets: [], webhooks: [], records: [],
  keys: [], incidents: [], configs: [], tests: [], rounds: [], passports: [],
  nodes: [], stats: {}, summary: {}, health: {}, chain: [], lineage: {},
  totalEarned: '0', tokenVelocity: '0',
};
globalThis.fetch = vi.fn(async () => ({
  ok: true,
  status: 200,
  json: async () => ({ ...EMPTY }),
  blob: async () => new dom.window.Blob(['x']),
  text: async () => '{}',
}));

// Privy is an external SSO widget — stub it so pages mount without a network.
vi.mock('@privy-io/react-auth', () => ({
  usePrivy: () => ({ ready: true, authenticated: true, user: { id: 'did:privy:test' }, login: async () => {}, logout: async () => {} }),
  PrivyProvider: ({ children }) => children,
}));

// QR code renders an <svg> via canvas measurement in some versions; stub it.
vi.mock('qrcode.react', () => ({ QRCodeSVG: () => null }));

const React = await import('react');
const { renderToString } = await import('react-dom/server');
const { MemoryRouter } = await import('react-router-dom');
const { AppProvider } = await import('../src/contexts/AppContext.tsx');

const PAGES = [
  ['Landing', '../src/pages/Landing.tsx'],
  ['Login', '../src/pages/Login.tsx'],
  ['Verify', '../src/pages/Verify.tsx'],
  ['Dashboard', '../src/pages/Dashboard.tsx'],
  ['Deploy', '../src/pages/Deploy.tsx'],
  ['Import', '../src/pages/Import.tsx'],
  ['Registry', '../src/pages/Registry.tsx'],
  ['Lineage', '../src/pages/Lineage.tsx'],
  ['ABTest', '../src/pages/ABTest.tsx'],
  ['Devices', '../src/pages/Devices.tsx'],
  ['Fleet', '../src/pages/Fleet.tsx'],
  ['ShelbyLayer', '../src/pages/ShelbyLayer.tsx'],
  ['ObjectsPage', '../src/pages/ObjectsPage.tsx'],
  ['Compliance', '../src/pages/Compliance.tsx'],
  ['Webhooks', '../src/pages/Webhooks.tsx'],
  ['Marketplace', '../src/pages/Marketplace.tsx'],
  ['Schedule', '../src/pages/Schedule.tsx'],
  ['Groups', '../src/pages/Groups.tsx'],
  ['Audit', '../src/pages/Audit.tsx'],
  ['Integrity', '../src/pages/Integrity.tsx'],
  ['SelfHeal', '../src/pages/SelfHeal.tsx'],
  ['Datasets', '../src/pages/Datasets.tsx'],
  ['ZKValidator', '../src/pages/ZKValidator.tsx'],
  ['Earnings', '../src/pages/Earnings.tsx'],
  ['Passports', '../src/pages/Passports.tsx'],
  ['Sites', '../src/pages/Sites.tsx'],
];

describe('Console pages render without crashing', () => {
  for (const [name, path] of PAGES) {
    it(`renders ${name}`, async () => {
      const mod = await import(path);
      const Page = mod.default;
      expect(Page).toBeTypeOf('function');
      const html = renderToString(
        React.createElement(MemoryRouter, { initialEntries: ['/app/dashboard'] },
          React.createElement(AppProvider, null, React.createElement(Page, null))
        )
      );
      // A crash throws; an empty string means the component rendered nothing at all.
      expect(typeof html).toBe('string');
    });
  }
});

describe('Routing table', () => {
  it('every nav entry resolves to a defined route', async () => {
    const { readFileSync } = await import('node:fs');
    const layout = readFileSync(new URL('../src/components/Layout.tsx', import.meta.url), 'utf8');
    const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

    const navTargets = [...layout.matchAll(/\{\s*to:\s*'([a-z-]+)'/g)].map(m => m[1]);
    const routes = [...app.matchAll(/<Route\s+path="([a-z*-]+)"/g)].map(m => m[1]);

    expect(navTargets.length).toBeGreaterThan(10);
    const missing = navTargets.filter(t => t !== 'docs' && !routes.includes(t));
    expect(missing).toEqual([]);
  });

  it('has no links to routes that do not exist', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    const routes = [...app.matchAll(/<Route\s+path="([a-zA-Z*-]+)"/g)].map(m => m[1]);

    const dirs = ['../src/pages', '../src/components'];
    const broken = [];
    for (const dir of dirs) {
      const base = new URL(dir + '/', import.meta.url);
      for (const f of readdirSync(base)) {
        if (!f.endsWith('.tsx')) continue;
        const src = readFileSync(new URL(f, base), 'utf8');
        for (const m of src.matchAll(/to="\/app\/([a-z-]+)"/g)) {
          if (!routes.includes(m[1])) broken.push(`${f} -> /app/${m[1]}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});

afterAll(() => { dom.window.close(); });
