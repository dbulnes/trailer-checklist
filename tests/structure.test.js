import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(new URL('.', import.meta.url).pathname, '..');

describe('project structure', () => {
  const requiredFiles = [
    'index.html',
    'manifest.json',
    'service-worker.js',
    'css/styles.css',
    'js/app.js',
    'js/checklist-data.js',
    'js/cloud.js',
  ];

  for (const file of requiredFiles) {
    it(`${file} exists`, () => {
      assert.ok(fs.existsSync(path.join(root, file)), `${file} is missing`);
    });
  }
});

describe('index.html references', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  it('links to external stylesheet', () => {
    assert.ok(html.includes('href="css/styles.css"'), 'missing css/styles.css link');
  });

  it('references JS files in js/ directory', () => {
    assert.ok(html.includes('src="js/checklist-data.js"'));
    assert.ok(html.includes('src="js/app.js"'));
    assert.ok(html.includes('src="js/cloud.js"'));
  });

  it('has no inline <style> block', () => {
    assert.ok(!html.includes('<style>'), 'index.html still has inline styles');
  });

  it('includes PWA manifest link', () => {
    assert.ok(html.includes('rel="manifest"'));
  });
});

describe('service-worker.js', () => {
  const sw = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

  it('caches all app assets', () => {
    assert.ok(sw.includes('./css/styles.css'), 'SW missing css/styles.css');
    assert.ok(sw.includes('./js/app.js'), 'SW missing js/app.js');
    assert.ok(sw.includes('./js/checklist-data.js'), 'SW missing js/checklist-data.js');
    assert.ok(sw.includes('./js/cloud.js'), 'SW missing js/cloud.js');
    assert.ok(sw.includes('./index.html'), 'SW missing index.html');
    assert.ok(sw.includes('./manifest.json'), 'SW missing manifest.json');
  });

  it('bypasses cache for version.txt', () => {
    assert.ok(sw.includes('version.txt'), 'SW must handle version.txt as network-only');
  });
});

describe('CI hash includes service-worker.js', () => {
  const ci = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');

  it('hash input includes service-worker.js', () => {
    // The HASH= line in CI must cat service-worker.js so SW-only changes bust the cache
    const hashLine = ci.split('\n').find(l => l.includes('HASH=$(cat'));
    assert.ok(hashLine, 'CI must have a HASH=$(cat ...) line');
    assert.ok(hashLine.includes('service-worker.js'), 'CI hash must include service-worker.js');
  });
});

describe('supabase edge function', () => {
  it('generate-pdf function exists', () => {
    assert.ok(
      fs.existsSync(path.join(root, 'supabase/functions/generate-pdf/index.ts')),
      'generate-pdf edge function is missing'
    );
  });

  it('setup.sql includes inspection-pdfs bucket', () => {
    const sql = fs.readFileSync(path.join(root, 'scripts/setup.sql'), 'utf8');
    assert.ok(sql.includes('inspection-pdfs'), 'setup.sql must create inspection-pdfs bucket');
  });
});

describe('manifest.json', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

  it('has required PWA fields', () => {
    assert.ok(manifest.name, 'missing name');
    assert.ok(manifest.short_name, 'missing short_name');
    assert.ok(manifest.start_url, 'missing start_url');
    assert.ok(manifest.display, 'missing display');
    assert.ok(manifest.icons && manifest.icons.length > 0, 'missing icons');
  });
});
