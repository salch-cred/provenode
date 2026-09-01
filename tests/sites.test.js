import { describe, it, expect } from 'vitest';
import {
  slugify, validateSlug, contentTypeFor, normalizeSitePath,
  buildSiteRecord, buildDeploymentRecord, siteBlobName, manifestBlobName,
} from '../lib/sites.js';

describe('Shelby Sites lib', () => {
  it('slugifies names into safe URL slugs', () => {
    expect(slugify('My Portfolio!')).toBe('my-portfolio');
    expect(slugify('  Tech/Blog #2  ')).toBe('tech-blog-2');
    expect(slugify('---')).not.toBe('');
    expect(slugify('')).toMatch(/^site-/);
  });

  it('caps slug length at 48 chars', () => {
    const long = slugify('a'.repeat(200));
    expect(long.length).toBeLessThanOrEqual(48);
  });

  it('validates slug format strictly', () => {
    expect(validateSlug('my-site')).toBe(true);
    expect(validateSlug('abc')).toBe(true);
    expect(validateSlug('ab')).toBe(false);        // too short
    expect(validateSlug('-bad-start')).toBe(false); // must start alnum
    expect(validateSlug('UPPER')).toBe(false);       // lowercase only
    expect(validateSlug('has space')).toBe(false);
  });

  it('maps extensions to MIME types', () => {
    expect(contentTypeFor('index.html')).toContain('text/html');
    expect(contentTypeFor('styles.CSS')).toContain('text/css');
    expect(contentTypeFor('app.mjs')).toContain('javascript');
    expect(contentTypeFor('logo.svg')).toContain('svg');
    expect(contentTypeFor('font.woff2')).toContain('woff2');
    expect(contentTypeFor('data.json')).toContain('json');
    expect(contentTypeFor('blob.bin')).toBe('application/octet-stream');
  });

  it('normalizes site paths safely (no traversal, index handling)', () => {
    expect(normalizeSitePath('')).toBe('index.html');
    expect(normalizeSitePath('/')).toBe('index.html');
    expect(normalizeSitePath('about/')).toBe('about/index.html');
    expect(normalizeSitePath('assets/app.js')).toBe('assets/app.js');
    expect(normalizeSitePath('..\\..\\etc\\passwd')).not.toContain('..');
    expect(normalizeSitePath('a//b')).toBe('a/b');
    expect(normalizeSitePath('a/b/../../../c')).not.toContain('..');
  });

  it('builds a site record with required fields', () => {
    const s = buildSiteRecord({ name: 'Portfolio', slug: 'portfolio', description: 'x', framework: 'vite', owner: 'user-1' });
    expect(s.id).toMatch(/^site_/);
    expect(s.slug).toBe('portfolio');
    expect(s.framework).toBe('vite');
    expect(s.owner).toBe('user-1');
    expect(s.deploymentCount).toBe(0);
    expect(s.status).toBe('ready');
    expect(new Date(s.createdAt).toString()).not.toBe('Invalid Date');
  });

  it('builds a deployment record with byte totals and file metadata', () => {
    const files = [
      { path: 'index.html', size: 1200, sha256: 'a', blobName: 'b', objectId: 'o' },
      { path: 'app.js', size: 800, sha256: 'c', blobName: 'd', objectId: 'e' },
    ];
    const d = buildDeploymentRecord({ siteId: 'site_1', siteSlug: 'demo', files, entryPath: 'index.html' });
    expect(d.id).toMatch(/^dep_/);
    expect(d.fileCount).toBe(2);
    expect(d.totalBytes).toBe(2000);
    expect(d.siteSlug).toBe('demo');
    expect(d.urlPath).toBe('/s/demo');
  });

  it('constructs Shelby blob names with sites/ prefix and deployment scoping', () => {
    expect(siteBlobName('demo', 'dep_1', 'index.html')).toBe('sites/demo/dep_1/index.html');
    expect(siteBlobName('demo', 'dep_1', 'assets/app.js')).toBe('sites/demo/dep_1/assets/app.js');
    expect(siteBlobName('demo', 'dep_1', 'we!rd path.txt')).not.toContain('!');
    expect(manifestBlobName('demo', 'dep_1')).toBe('sites/demo/dep_1/__manifest.json');
  });
});
