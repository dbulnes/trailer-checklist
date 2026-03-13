import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// checklist-data.js uses `const SECTIONS = [...]` — wrap it so we can extract the value
const code = fs.readFileSync(path.join(new URL('.', import.meta.url).pathname, '..', 'js', 'checklist-data.js'), 'utf8');
const wrapped = code.replace('const SECTIONS', 'var SECTIONS');
const context = vm.createContext({});
vm.runInContext(wrapped, context);
const { SECTIONS } = context;

describe('checklist-data', () => {
  it('SECTIONS is defined and non-empty', () => {
    assert.ok(Array.isArray(SECTIONS));
    assert.ok(SECTIONS.length > 0, 'should have at least one section');
  });

  it('every section has a title and items array', () => {
    for (const section of SECTIONS) {
      assert.ok(typeof section.title === 'string', 'section missing title');
      assert.ok(section.title.length > 0, 'section has empty title');
      assert.ok(Array.isArray(section.items), `section "${section.title}" missing items array`);
      assert.ok(section.items.length > 0, `section "${section.title}" has no items`);
    }
  });

  it('items are strings or objects with required text field', () => {
    for (const section of SECTIONS) {
      for (const item of section.items) {
        if (typeof item === 'string') {
          assert.ok(item.length > 0, `empty string item in "${section.title}"`);
        } else if (typeof item === 'object') {
          assert.ok(typeof item.text === 'string' && item.text.length > 0,
            `object item missing text in "${section.title}"`);
        } else {
          assert.fail(`invalid item type in "${section.title}": ${typeof item}`);
        }
      }
    }
  });

  it('no duplicate item keys within a section', () => {
    for (const section of SECTIONS) {
      const keys = section.items.map(item =>
        typeof item === 'string' ? item : item.text
      );
      const unique = new Set(keys);
      assert.equal(keys.length, unique.size,
        `duplicate items in "${section.title}"`);
    }
  });
});
