#!/usr/bin/env node

import * as prompts from '@clack/prompts';
import chalk from 'chalk';
import { execa } from 'execa';
import fs from 'fs-extra';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const templateDirectory = fileURLToPath(new URL('../template/', import.meta.url));
const generatedDirectories = new Set(['node_modules', 'android', 'ios', 'dist', 'web-build', '.expo', '.git']);
const folderNameFor = (appName) => appName.toLowerCase().replace(/\s+/g, '-');

export function validateAppName(value) {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9 -]{0,49}$/.test(value.trim())) {
    return 'Use 1–50 characters: letters, numbers, spaces or hyphens, starting with a letter.';
  }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(folderNameFor(value.trim()))) {
    return 'Choose a name that is not reserved by Windows.';
  }
}

export function validateBundleId(value) {
  if (typeof value !== 'string' || value.length > 255 || !/^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+$/.test(value)) {
    return 'Use a reverse-domain identifier such as com.skyestone.fitpulse; each segment must start with a letter.';
  }
}

export function validatePrimaryColor(value) {
  if (typeof value !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)) {
    return 'Enter a hex color such as #FF5722 or #F52.';
  }
}

export async function validateAsset(value, isIcon = false) {
  if (!value) return;
  let handle;
  try {
    const assetPath = path.resolve(value);
    if (!(await fs.stat(assetPath)).isFile()) return 'Select an image file, not a directory.';
    handle = await open(assetPath, 'r');
    const header = Buffer.alloc(24);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead < 24 || header.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || header.toString('ascii', 12, 16) !== 'IHDR') {
      return 'Select a PNG image file.';
    }
    const width = header.readUInt32BE(16);
    const height = header.readUInt32BE(20);
    if (!width || !height) return 'The PNG must have nonzero dimensions.';
    if (isIcon && (width !== 1024 || height !== 1024)) return 'The icon must be exactly 1024 × 1024 pixels.';
  } catch {
    return 'The image file does not exist or cannot be read.';
  } finally {
    await handle?.close();
  }
}

export function replacePlaceholders(source, values) {
  const replacements = {
    ___APP_NAME___: values.appName,
    ___BUNDLE_ID___: values.bundleId,
    ___PRIMARY_COLOR___: values.primaryColor,
  };
  // Tokens live inside single-quoted TypeScript strings. Use a callback so '$'
  // sequences are literal, and escape quotes/backslashes before writing source.
  return source.replace(/___(?:APP_NAME|BUNDLE_ID|PRIMARY_COLOR)___/g, (token) =>
    replacements[token].replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\r', '\\r').replaceAll('\n', '\\n'));
}

const installDependencies = (directory) => execa('npm', ['install'], { cwd: directory, stdio: 'inherit' });

export async function createProject(options, install = installDependencies) {
  const { appName, bundleId, primaryColor, cwd = process.cwd() } = options;
  for (const [validate, value] of [[validateAppName, appName], [validateBundleId, bundleId], [validatePrimaryColor, primaryColor]]) {
    const error = validate(value);
    if (error) throw new Error(error);
  }
  const name = appName.trim();
  const folderName = folderNameFor(name);
  const directory = path.join(cwd, folderName);
  const relativeToTemplate = path.relative(templateDirectory, directory);
  if (relativeToTemplate === '' || (!relativeToTemplate.startsWith(`..${path.sep}`) && relativeToTemplate !== '..' && !path.isAbsolute(relativeToTemplate))) {
    throw new Error('Create projects outside the generator’s template directory.');
  }
  const assets = {};
  for (const [key, isIcon] of [['customIcon', true], ['customSplash', false]]) {
    if (options[key]?.trim()) {
      const asset = path.resolve(cwd, options[key].trim());
      const error = await validateAsset(asset, isIcon);
      if (error) throw new Error(`${key}: ${error}`);
      assets[key] = asset;
    }
  }
  if (!(await fs.pathExists(templateDirectory))) throw new Error('The bundled template directory is missing.');
  try {
    // Exclusive creation also protects against a folder appearing after prompts.
    await fs.mkdir(directory);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`The target folder already exists: ${directory}`);
    throw error;
  }
  await fs.copy(templateDirectory, directory, {
    overwrite: false,
    errorOnExist: true,
    filter: (source) => !generatedDirectories.has(path.relative(templateDirectory, source).split(path.sep)[0]),
  });
  for (const filename of ['app.config.ts', 'src/theme/config.ts']) {
    const file = path.join(directory, filename);
    const source = await fs.readFile(file, 'utf8');
    await fs.writeFile(file, replacePlaceholders(source, { appName: name, bundleId, primaryColor }), 'utf8');
  }
  // Keep JSON metadata consistent with the generated TypeScript configuration.
  const appFile = path.join(directory, 'app.json');
  const app = await fs.readJson(appFile);
  Object.assign(app.expo, { name, slug: folderName, scheme: folderName });
  app.expo.android = { ...app.expo.android, package: bundleId };
  app.expo.ios = { ...app.expo.ios, bundleIdentifier: bundleId };
  await fs.writeJson(appFile, app, { spaces: 2 });
  const packageFile = path.join(directory, 'package.json');
  const pkg = await fs.readJson(packageFile);
  pkg.name = folderName;
  await fs.writeJson(packageFile, pkg, { spaces: 2 });
  const lockFile = path.join(directory, 'package-lock.json');
  const lock = await fs.readJson(lockFile);
  lock.name = folderName;
  if (lock.packages?.['']) lock.packages[''].name = folderName;
  await fs.writeJson(lockFile, lock, { spaces: 2 });
  const gitignore = path.join(directory, '.gitignore');
  if (!(await fs.pathExists(gitignore))) {
    await fs.writeFile(gitignore, 'node_modules/\n.expo/\nandroid/\nios/\ndist/\nweb-build/\n*.tsbuildinfo\n.DS_Store\n.env\n.env.*\n!.env.example\n');
  }
  if (assets.customIcon) {
    await fs.copyFile(assets.customIcon, path.join(directory, 'assets/icon.png'));
    await fs.copyFile(assets.customIcon, path.join(directory, 'assets/adaptive-icon.png'));
  }
  if (assets.customSplash) await fs.copyFile(assets.customSplash, path.join(directory, 'assets/splash.png'));
  try {
    await install(directory);
  } catch {
    throw new Error(`npm install failed. Your project files are preserved at ${directory}.\nRun: cd ${folderName}\nThen: npm install`);
  }
  return { directory, folderName };
}

async function main() {
  prompts.intro(chalk.bold.blue('Skyestone AI · React Native Generator'));
  const defaultBundle = (appName) => `com.skyestone.${appName.trim().toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const answers = await prompts.group({
    appName: () => prompts.text({
      message: 'App name', placeholder: 'FitPulse', defaultValue: 'FitPulse',
      validate: async (value) => {
        const name = value === undefined || value === '' ? 'FitPulse' : value.trim();
        const error = validateAppName(name);
        if (error) return error;
        if (await fs.pathExists(path.join(process.cwd(), folderNameFor(name)))) return 'That project folder already exists. Choose another name.';
      },
    }),
    bundleId: ({ results }) => prompts.text({
      message: 'Bundle identifier', placeholder: defaultBundle(results.appName), defaultValue: defaultBundle(results.appName),
      validate: (value) => validateBundleId((value || defaultBundle(results.appName)).trim()),
    }),
    primaryColor: () => prompts.text({
      message: 'Primary color', placeholder: '#FF5722', defaultValue: '#FF5722',
      validate: (value) => validatePrimaryColor((value || '#FF5722').trim()),
    }),
    customIcon: () => prompts.text({
      message: 'Custom icon PNG path (optional, 1024 × 1024)', defaultValue: '',
      validate: (value) => validateAsset(value?.trim(), true),
    }),
    customSplash: () => prompts.text({
      message: 'Custom splash PNG path (optional)', defaultValue: '',
      validate: (value) => validateAsset(value?.trim()),
    }),
  }, { onCancel: () => { prompts.cancel('Project creation cancelled.'); process.exit(0); } });

  try {
    prompts.log.step('Creating your project…');
    const project = await createProject({
      appName: answers.appName.trim(), bundleId: answers.bundleId.trim(), primaryColor: answers.primaryColor.trim(),
      customIcon: answers.customIcon, customSplash: answers.customSplash,
    }, async (directory) => {
      prompts.log.success('Template and branding are ready.');
      prompts.log.step('Installing dependencies with npm…');
      await installDependencies(directory);
    });
    prompts.outro(`
🎉 Skyestone app starter initialized successfully!

📁 Project Directory: ${project.directory}

Next steps:
  1. cd ${project.folderName}

Run options:
  • Native Android (Emulator/Device):
    npx expo run:android

  • Native iOS (Mac / Xcode Simulator):
    npx expo run:ios

  • Rapid JS Sandbox (Expo Go):
    npx expo start --go
`);
  } catch (error) {
    prompts.log.error(error.message);
    process.exitCode = 1;
  }
}

// Resolve symlinks so the executable also runs correctly through npm's bin link.
if (process.argv[1] && await fs.pathExists(process.argv[1]) && await fs.realpath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
