/**
 * Basic lint checks — no dependencies required.
 * Validates HTML structure and catches common issues.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(new URL('.', import.meta.url).pathname, '..');
let exitCode = 0;

function check(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    exitCode = 1;
  } else {
    console.log(`OK: ${message}`);
  }
}

// Check index.html is valid-ish
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
check(html.startsWith('<!DOCTYPE html>'), 'index.html starts with DOCTYPE');
check(html.includes('<html'), 'index.html has <html> tag');
check(html.includes('</html>'), 'index.html has closing </html> tag');
check(html.includes('<head>'), 'index.html has <head>');
check(html.includes('</head>'), 'index.html has closing </head>');
check(html.includes('<body>'), 'index.html has <body>');
check(html.includes('</body>'), 'index.html has closing </body>');

// Check no stale root-level JS references
check(!html.includes('src="checklist-data.js"'), 'no stale root-level checklist-data.js ref');
check(!html.includes('src="app.js"'), 'no stale root-level app.js ref');
check(!html.includes('src="cloud.js"'), 'no stale root-level cloud.js ref');

// Check JS files parse without syntax errors
const jsFiles = ['js/app.js', 'js/checklist-data.js', 'js/cloud.js'];
for (const file of jsFiles) {
  try {
    const code = fs.readFileSync(path.join(root, file), 'utf8');
    new Function(code); // parse check only
    console.log(`OK: ${file} parses without syntax errors`);
  } catch (e) {
    console.error(`FAIL: ${file} has syntax error: ${e.message}`);
    exitCode = 1;
  }
}

// Check CSS file is non-empty
const css = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');
check(css.length > 100, 'styles.css is non-empty');

// Check manifest.json is valid JSON
try {
  JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  console.log('OK: manifest.json is valid JSON');
} catch (e) {
  console.error(`FAIL: manifest.json is invalid JSON: ${e.message}`);
  exitCode = 1;
}

process.exit(exitCode);
