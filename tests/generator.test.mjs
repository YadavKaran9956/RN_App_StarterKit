import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createProject, replacePlaceholders, validateAppName, validateAsset, validateBundleId, validatePrimaryColor } from '../bin/index.mjs';

const template = fileURLToPath(new URL('../template/', import.meta.url));
const defaults = { appName: 'FitPulse', bundleId: 'com.skyestone.fitpulse', primaryColor: '#FF5722' };

async function workspace(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'skyestone-generator-test-'));
  t.after(() => fs.remove(directory));
  return directory;
}

test('rejects unsafe app names, invalid bundle IDs and non-hex colors', () => {
  for (const name of [null, undefined, '', '../escape', '/absolute', 'A/B', 'A\\B', 'con', 'A'.repeat(51)]) assert.ok(validateAppName(name));
  for (const bundle of [null, 'fitpulse', 'com.123', '../escape', 'com.sky-stone.app']) assert.ok(validateBundleId(bundle));
  for (const color of [null, 'red', 'FF5722', '#12', '#GGGGGG', '#1234567']) assert.ok(validatePrimaryColor(color));
  assert.equal(validateAppName('Fit Pulse'), undefined);
  assert.equal(validateBundleId('com.skyestone.fitpulse'), undefined);
  assert.equal(validatePrimaryColor('#f52'), undefined);
});

test('copies the app, replaces every token and synchronizes metadata before installing once', async (t) => {
  const cwd = await workspace(t);
  const sourceConfig = await fs.readFile(path.join(template, 'app.config.ts'), 'utf8');
  let installs = 0;
  const result = await createProject({ ...defaults, appName: 'Fit Pulse', cwd }, async (directory) => {
    installs++;
    assert.equal(directory, path.join(cwd, 'fit-pulse'));
    for (const filename of ['app.config.ts', 'src/theme/config.ts']) {
      const source = await fs.readFile(path.join(directory, filename), 'utf8');
      assert.doesNotMatch(source, /___(?:APP_NAME|BUNDLE_ID|PRIMARY_COLOR)___/);
      assert.ok(source.includes('Fit Pulse'));
      assert.ok(source.includes('com.skyestone.fitpulse'));
      assert.ok(source.includes('#FF5722'));
    }
    assert.equal((await fs.readJson(path.join(directory, 'app.json'))).expo.android.package, defaults.bundleId);
  });
  assert.equal(installs, 1);
  assert.equal(result.folderName, 'fit-pulse');
  const app = (await fs.readJson(path.join(result.directory, 'app.json'))).expo;
  assert.equal(app.name, 'Fit Pulse');
  assert.equal(app.scheme, 'fit-pulse');
  assert.equal(app.ios.bundleIdentifier, defaults.bundleId);
  assert.equal((await fs.readJson(path.join(result.directory, 'package.json'))).name, 'fit-pulse');
  assert.equal((await fs.readJson(path.join(result.directory, 'package-lock.json'))).packages[''].name, 'fit-pulse');
  assert.ok(await fs.pathExists(path.join(result.directory, '.gitignore')));
  assert.ok(await fs.pathExists(path.join(result.directory, 'app/(auth)/login.tsx')));
  assert.equal(await fs.readFile(path.join(template, 'app.config.ts'), 'utf8'), sourceConfig);
});

test('custom icon replaces both launcher assets; custom splash replaces only the splash', async (t) => {
  const cwd = await workspace(t);
  const customIcon = path.join(template, 'assets/adaptive-icon.png');
  const customSplash = path.join(template, 'assets/icon.png');
  const result = await createProject({ ...defaults, cwd, customIcon, customSplash }, async () => {});
  for (const name of ['icon.png', 'adaptive-icon.png']) {
    assert.deepEqual(await fs.readFile(path.join(result.directory, 'assets', name)), await fs.readFile(customIcon));
  }
  assert.deepEqual(await fs.readFile(path.join(result.directory, 'assets/splash.png')), await fs.readFile(customSplash));
});

test('rejects missing, invalid and incorrectly sized PNG assets before creating a project', async (t) => {
  const cwd = await workspace(t);
  assert.equal(await validateAsset(''), undefined);
  assert.ok(await validateAsset(path.join(cwd, 'missing.png')));
  assert.ok(await validateAsset(cwd));
  const invalid = path.join(cwd, 'invalid.png');
  await fs.writeFile(invalid, 'not a PNG');
  assert.ok(await validateAsset(invalid));
  const small = Buffer.from(await fs.readFile(path.join(template, 'assets/icon.png')));
  small.writeUInt32BE(64, 16);
  await fs.writeFile(invalid, small);
  assert.match(await validateAsset(invalid, true), /1024/);
  await assert.rejects(createProject({ ...defaults, cwd, customIcon: invalid }, async () => {}), /1024/);
  assert.equal(await fs.pathExists(path.join(cwd, 'fitpulse')), false);
});

test('never overwrites an existing project or dangling symlink', async (t) => {
  const cwd = await workspace(t);
  const target = path.join(cwd, 'fitpulse');
  await fs.ensureDir(target);
  await fs.writeFile(path.join(target, 'keep.txt'), 'existing work');
  await assert.rejects(createProject({ ...defaults, cwd }, async () => {}), /already exists/);
  assert.equal(await fs.readFile(path.join(target, 'keep.txt'), 'utf8'), 'existing work');
  const linkedName = 'Linked';
  await fs.symlink(path.join(cwd, 'missing-target'), path.join(cwd, 'linked'));
  await assert.rejects(createProject({ ...defaults, cwd, appName: linkedName }, async () => {}), /already exists/);
});

test('rejects invalid values and template-recursive destinations without creating files', async (t) => {
  const cwd = await workspace(t);
  await assert.rejects(createProject({ ...defaults, cwd, primaryColor: 'red' }, async () => {}), /hex color/);
  assert.deepEqual(await fs.readdir(cwd), []);
  await assert.rejects(createProject({ ...defaults, cwd: template }, async () => {}), /outside/);
});

test('installation failures preserve the generated files and provide recovery steps', async (t) => {
  const cwd = await workspace(t);
  await assert.rejects(createProject({ ...defaults, cwd }, async () => { throw Error('offline'); }), /npm install failed[\s\S]*preserved[\s\S]*npm install/);
  assert.ok(await fs.pathExists(path.join(cwd, 'fitpulse/package.json')));
  assert.ok(await fs.pathExists(path.join(cwd, 'fitpulse/app/(auth)/login.tsx')));
});

test('replacement preserves literal dollar sequences and safely escapes TypeScript strings', () => {
  const values = { appName: "O'Brien \\ Fitness $&\nNew", bundleId: 'com.example.app', primaryColor: '#123456' };
  const source = replacePlaceholders("({name:'___APP_NAME___',again:'___APP_NAME___',bundle:'___BUNDLE_ID___',color:'___PRIMARY_COLOR___'})", values);
  const evaluated = vm.runInNewContext(source);
  assert.equal(evaluated.name, values.appName);
  assert.equal(evaluated.again, values.appName);
  assert.equal(evaluated.bundle, values.bundleId);
  assert.equal(evaluated.color, values.primaryColor);
});
