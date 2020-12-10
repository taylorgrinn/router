const playwright = require('playwright');
const sass = require('sass');
const fs = require('fs');
const path = require('path');
const serveStatic = require('serve-static');
const http = require('http');
const assert = require('assert');
const jsonImporter = require('node-sass-json-importer');

const OUTPUT = path.resolve(__dirname, 'output');
if (!fs.existsSync(OUTPUT)) fs.mkdirSync(OUTPUT);
const PORT = process.env.PORT || 8080;
const server = http.createServer(serveStatic(OUTPUT, { index: 'index.html' }));

const serve = () => {
  const listener = server.listen(PORT);
  return () => listener.close();
};

const writeTestCase = (router, route, tests) => () => {
  const getTestDiv = (t) => {
    if (typeof t === 'string') return `<span data-route="${t}">Test</span>`;

    return `<div data-route="${t.test}">
      ${getTestDiv(t.child)}
    </div>`;
  };

  const sassFile = path.resolve(OUTPUT, 'main.scss');

  fs.writeFileSync(
    path.resolve(OUTPUT, 'router.json'),
    JSON.stringify({ router }, null, 2)
  );

  fs.writeFileSync(
    sassFile,
    `
      @use '../..' as router;
      @import 'router.json';

      .container {
        @include router.router($router);
      }
    `
  );

  const { css } = sass.renderSync({
    file: sassFile,
    outputStyle: 'compressed',
    importer: jsonImporter(),
    includePaths: [path.resolve(__dirname, '..', 'node_modules')],
  });

  fs.writeFileSync(
    path.resolve(OUTPUT, 'index.html'),
    `
      <html>
        <style>
          ${css.toString()}
        </style>
        <div class="container" data-route-state="${route}">
          ${tests.map((test) => getTestDiv(test)).join('')}
        </div>
      </html>
    `
  );
};

const pagePromise = playwright.chromium
  .launch()
  .then((browser) => browser.newContext())
  .then((context) => context.newPage());

const assertVisibility = async (test, hidden) => {
  const page = await pagePromise;

  await page.goto(`http://localhost:${PORT}`);

  const styles = await page.evaluate(
    (test) =>
      window.getComputedStyle(document.querySelector(`[data-route='${test}']`)),
    test
  );

  assert.strictEqual(styles.display === 'none', hidden);
};

const assertHidden = (...ts) => async () => {
  const tests = [].concat(ts);
  for (const test of tests) await assertVisibility(test, true);
};

const assertVisible = (...ts) => async () => {
  const tests = [].concat(ts);
  for (const test of tests) await assertVisibility(test, false);
};

module.exports = { writeTestCase, serve, assertHidden, assertVisible };
