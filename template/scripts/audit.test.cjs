/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const { AxiosError } = require('axios');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function captureScreen(Screen) {
  let element;
  function Capture() {
    element = Screen();
    return null;
  }
  renderToStaticMarkup(React.createElement(Capture));
  return element;
}

function findElement(element, type) {
  if (!React.isValidElement(element)) return undefined;
  if (element.type === type) return element;
  for (const child of React.Children.toArray(element.props.children)) {
    const found = findElement(child, type);
    if (found) return found;
  }
}

const root = path.resolve(__dirname, '..');

test('native branding config preserves app identity and resolves asset paths and colors', () => {
  const configure = load('app.config.ts').default;
  const base = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
  const config = configure({ config: base });
  assert.equal(config.name, base.name);
  assert.equal(config.scheme, base.scheme);
  assert.equal(config.android.package, base.android.package);
  assert.ok(config.plugins.includes('expo-router'));
  assert.match(config.splash.backgroundColor, /^#[0-9a-f]{6}$/i);
  assert.equal(config.splash.backgroundColor, config.android.adaptiveIcon.backgroundColor);
  const plugin = config.plugins.find((item) => Array.isArray(item) && item[0] === 'expo-splash-screen');
  for (const key of ['image', 'resizeMode', 'backgroundColor']) {
    assert.equal(plugin[1][key], config.splash[key]);
    assert.equal(plugin[1].ios[key], config.splash[key]);
  }
  assert.ok(config.plugins.includes('expo-system-ui'));
  assert.equal(config.ios.supportsTablet, true);
  assert.equal(config.ios.bundleIdentifier, base.ios?.bundleIdentifier ?? base.android.package);
  assert.equal(config.ios.backgroundColor, config.android.backgroundColor);
  assert.equal(config.ios.backgroundColor, config.splash.backgroundColor);
  for (const asset of [config.icon, config.splash.image, config.android.adaptiveIcon.foregroundImage]) {
    const png = fs.readFileSync(path.resolve(root, asset));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), 1024);
    assert.equal(png.readUInt32BE(20), 1024);
  }
});

// Execute project code with real Zustand, Zod and Axios. Only native/UI boundaries
// are mocked; these checks do not replace navigation or device integration tests.
function load(file, mocks = {}, logs = []) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    URL,
    module,
    exports: module.exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
    console: {
      log: (...args) => logs.push(args),
      warn: (...args) => logs.push(args),
      error: (...args) => logs.push(args),
    },
  }, { filename: file });
  return module.exports;
}

function setup() {
  const values = new Map();
  const logs = [];
  const failures = { read: false, write: false, remove: false };
  const nativeStorage = {
    getString(key) {
      if (failures.read) throw Error('Storage unavailable');
      return values.get(key);
    },
    set(key, value) {
      if (failures.write) throw Error('Storage unavailable');
      values.set(key, value);
    },
    remove(key) {
      if (failures.remove) throw Error('Storage unavailable');
      return values.delete(key);
    },
  };
  const storage = load('src/store/mmkv.ts', {
    'react-native-mmkv': { createMMKV: () => nativeStorage },
  }, logs);
  const createStore = () => load('src/store/authStore.ts', { './mmkv': storage }, logs).useAuthStore;
  const store = createStore();
  const api = load('src/services/api/client.ts', {
    '@/store/authStore': { useAuthStore: store },
  }, logs);
  return { values, logs, failures, storage, createStore, store, ...api };
}

const user = { id: 'user-1', name: 'Test 用户', email: 'test@example.com' };
const success = async (config) => ({
  config, status: 200, statusText: 'OK', headers: {}, data: {},
});
function failure(status, code = 'ERR_BAD_RESPONSE') {
  return async (config) => {
    const response = status
      ? { config, status, statusText: 'Error', headers: {}, data: {} }
      : undefined;
    throw new AxiosError('Request failed', code, config, undefined, response);
  };
}
function assertLoggedOut(store) {
  assert.equal(store.getState().token, null);
  assert.equal(store.getState().user, null);
  assert.equal(store.getState().isAuthenticated, false);
}

test('MMKV adapter and session restoration remain synchronous', () => {
  const { storage, store, createStore } = setup();
  assert.equal(storage.zustandStorage.getItem('missing'), null);
  assert.equal(storage.zustandStorage.setItem('key', '✓'), undefined);
  assert.equal(storage.zustandStorage.getItem('key'), '✓');
  assert.equal(storage.zustandStorage.removeItem('key'), undefined);
  assert.equal(store.getState().setAuth(user, 'jwt-1'), true);
  const restored = createStore();
  assert.equal(restored.persist.hasHydrated(), true);
  assert.equal(restored.getState().token, 'jwt-1');
  assert.equal(restored.getState().isAuthenticated, true);
});

test('Zod rejects invalid types and oversized payloads without replacing a valid session', () => {
  const { store, logs } = setup();
  store.getState().setAuth(user, 'jwt-1');
  const invalid = [
    [null, 'token'], [undefined, 'token'], [[], 'token'], [123, 'token'],
    [{}, 'token'], [{ id: '' }, 'token'], [{ id: '   ' }, 'token'],
    [{ id: 'x'.repeat(1000000) }, 'token'],
    [{ id: 'id', name: 'x'.repeat(1000000) }, 'token'],
    [{ id: 'id', email: null }, 'token'], [{ id: 'id', email: 'bad' }, 'token'],
    [user, null], [user, undefined], [user, 123], [user, {}],
    [user, ''], [user, '\r\nheader'], [user, 'bad token'],
    [user, 'x'.repeat(1000000)],
  ];
  for (const [invalidUser, token] of invalid) {
    assert.equal(store.getState().setAuth(invalidUser, token), false);
    assert.equal(store.getState().token, 'jwt-1');
  }
  assert.equal(store.getState().setAuth({ id: '用户-✓!@#$' }, 'token!@#$'), true);
  assert.equal(logs.length, 0);
});

test('corrupt or tampered persistence cannot supply authentication flags or actions', () => {
  const { values, createStore } = setup();
  for (const state of [null, {}, { user: null, token: 'jwt', isAuthenticated: true }]) {
    values.set('auth-storage', JSON.stringify({ state, version: 0 }));
    assertLoggedOut(createStore());
  }
  values.set('auth-storage', JSON.stringify({
    state: { user, token: 'jwt', isAuthenticated: false, logout: 'injected' }, version: 0,
  }));
  const store = createStore();
  assert.equal(store.getState().isAuthenticated, true);
  assert.equal(typeof store.getState().logout, 'function');
  values.set('auth-storage', '{broken json');
  store.persist.rehydrate();
  assertLoggedOut(store);
  assertLoggedOut(createStore());
});

test('storage failures fail closed without throwing or leaking credentials', () => {
  const { store, failures, values, logs, createStore } = setup();
  store.getState().setAuth(user, 'old-token');
  failures.write = true;
  assert.equal(store.getState().setAuth(user, 'new-token'), false);
  assertLoggedOut(store);
  assert.equal(values.has('auth-storage'), false);
  failures.write = false;
  store.getState().setAuth(user, 'jwt');
  failures.write = true;
  failures.remove = true;
  assert.equal(store.getState().logout(), false);
  assertLoggedOut(store);
  failures.read = true;
  assertLoggedOut(createStore());
  assert.equal(logs.length, 0);
});

test('rapid repeated auth/logout never retains a signed-in session', () => {
  const { store, createStore } = setup();
  for (let i = 0; i < 1000; i++) {
    store.getState().setAuth(user, `jwt-${i}`);
    store.getState().logout();
  }
  assertLoggedOut(store);
  assertLoggedOut(createStore());
});

test('Bearer token is read per request and removed after logout', async () => {
  const { store, client } = setup();
  for (const token of ['jwt-1', 'jwt-2']) {
    store.getState().setAuth(user, token);
    const response = await client.get('/profile', { adapter: success });
    assert.equal(response.config.headers.get('Authorization'), `Bearer ${token}`);
  }
  store.getState().logout();
  const response = await client.get('/public', {
    headers: { authorization: 'Bearer stale' }, adapter: success,
  });
  assert.equal(response.config.headers.has('Authorization'), false);
});

test('foreign origins, insecure URLs and URL credentials are blocked before transport', async () => {
  const { store, client } = setup();
  store.getState().setAuth(user, 'jwt');
  let calls = 0;
  const adapter = async (config) => { calls++; return success(config); };
  for (const url of [
    'https://other-host.invalid/path', '//other-host.invalid/path',
    'http://api.yourdomain.com/path', 'https://user:password@api.yourdomain.com/path',
    'https://[bad',
  ]) {
    await assert.rejects(client.get(url, { adapter }));
  }
  await assert.rejects(client.get('/profile', { baseURL: 'https://other-host.invalid', adapter }));
  assert.equal(calls, 0);
  assert.equal(store.getState().isAuthenticated, true);
});

test('401 clears memory and disk even when custom validateStatus accepts it', async () => {
  const { store, values, client } = setup();
  for (const adapter of [failure(401), async (config) => ({
    config, status: 401, statusText: 'Unauthorized', headers: {}, data: {},
  })]) {
    store.getState().setAuth(user, 'jwt');
    await assert.rejects(client.get('/profile', { adapter, validateStatus: () => true }));
    assertLoggedOut(store);
    assert.equal(JSON.parse(values.get('auth-storage')).state.token, null);
  }
});

test('403, 500, offline, timeout and unknown errors preserve the session and reject safely', async () => {
  const { store, client, logs } = setup();
  store.getState().setAuth(user, 'jwt');
  for (const adapter of [
    failure(403), failure(500), failure(undefined, 'ERR_NETWORK'),
    failure(undefined, 'ECONNABORTED'), () => Promise.reject(null),
  ]) {
    let rejected = false;
    try { await client.get('/profile', { adapter }); } catch { rejected = true; }
    assert.equal(rejected, true);
    assert.equal(store.getState().token, 'jwt');
  }
  assert.equal(client.defaults.timeout, 15000);
  assert.equal(logs.length, 0);
});

test('late and concurrent 401s cannot clear a newer session or leave an invalid session active', async () => {
  const { store, client } = setup();
  store.getState().setAuth(user, 'old-token');
  let release;
  const pending = client.get('/profile', {
    adapter: (config) => new Promise((_resolve, reject) => {
      release = () => reject(new AxiosError('Unauthorized', 'ERR_BAD_RESPONSE', config, undefined, {
        config, status: 401, statusText: 'Unauthorized', headers: {}, data: {},
      }));
    }),
  });
  store.getState().setAuth(user, 'new-token');
  release();
  await assert.rejects(pending);
  assert.equal(store.getState().token, 'new-token');
  const results = await Promise.allSettled(Array.from({ length: 50 }, () =>
    client.get('/profile', { adapter: failure(401) })));
  assert.ok(results.every((result) => result.status === 'rejected'));
  assertLoggedOut(store);
});

test('routing gates handle entry, cold navigation, deep links, auth changes and 401 logout', async () => {
  const { store, client } = setup();
  let segments = ['(main)', 'private'];
  let navigationState;
  const effects = [];
  const routes = [];
  const Slot = () => null;
  const Stack = () => null;
  const Redirect = () => null;
  const router = { replace: (route) => routes.push(route) };
  const mocks = {
    '@/store/authStore': { useAuthStore: (selector) => selector(store.getState()) },
    'expo-router': {
      Slot, Stack, Redirect, useSegments: () => segments, useRouter: () => router,
      useRootNavigationState: () => navigationState,
    },
    react: { useEffect: (effect) => effects.push(effect) },
    'expo-status-bar': { StatusBar: () => null },
  };
  const Root = load('app/_layout.tsx', mocks).default;
  const Main = load('app/(main)/_layout.tsx', mocks).default;
  const Auth = load('app/(auth)/_layout.tsx', mocks).default;
  const Entry = load('app/index.tsx', mocks).default;
  function render() {
    effects.length = 0;
    routes.length = 0;
    const layout = Root();
    assert.equal(layout.props.children[0].props.style, 'auto');
    assert.equal(layout.props.children[1].type, Slot);
    effects.forEach((effect) => effect());
    return [...routes];
  }
  assert.deepEqual(render(), []);
  navigationState = { key: 'ready' };
  assert.deepEqual(render(), ['/(auth)/login']);
  assert.equal(Main(), null);
  assert.equal(Entry().props.href, '/(auth)/login');
  assert.equal(Auth().type, Stack);
  assert.equal(Auth().props.screenOptions.headerShown, false);
  segments = ['(auth)', 'login'];
  assert.deepEqual(render(), []);
  store.getState().setAuth(user, 'jwt');
  assert.deepEqual(render(), ['/(main)']);
  assert.equal(Entry().props.href, '/(main)');
  assert.equal(Main().type, Stack);
  assert.equal(Main().props.screenOptions.headerShown, false);
  segments = ['(main)'];
  assert.deepEqual(render(), []);
  await assert.rejects(client.get('/profile', { adapter: failure(401) }));
  assert.deepEqual(render(), ['/(auth)/login']);
  assert.equal(Main(), null);
  segments = [];
  assert.deepEqual(render(), []);
});

test('existing screens use safe areas and light/dark theme tokens without applying color placeholders', () => {
  let scheme = 'light';
  const native = {
    StyleSheet: { create: (styles) => styles },
    Text: () => null,
    TextInput: 'TextInput',
    View: 'View',
    ScrollView: 'ScrollView',
    KeyboardAvoidingView: 'KeyboardAvoidingView',
    Pressable: 'Pressable',
    ActivityIndicator: 'ActivityIndicator',
    Platform: { OS: 'android' },
    useColorScheme: () => scheme,
  };
  const SafeAreaView = () => null;
  const config = load('src/theme/config.ts', { 'react-native': native });
  assert.match(config.APP_CONFIG.colors.primary, /^(?:___PRIMARY_COLOR___|#(?:[\da-f]{3}|[\da-f]{6}))$/i);
  for (const file of ['app/(auth)/login.tsx', 'app/(main)/index.tsx']) {
    const Screen = load(file, {
      'react-native': native,
      'react-native-safe-area-context': { SafeAreaView },
      '@/theme/config': config,
      '@/store/authStore': { useAuthStore: (selector) => selector({ setAuth: () => true }) },
      '@/components/Button': { Button: 'Button' },
      '@/components/Input': { Input: 'Input' },
    }).default;
    for (const mode of ['light', 'dark']) {
      scheme = mode;
      const element = captureScreen(Screen);
      assert.equal(element.type, SafeAreaView);
      assert.equal(element.props.style[1], config.theme[mode].screen);
      assert.ok(!JSON.stringify(element.props.style).includes('___PRIMARY_COLOR___'));
    }
  }
});

function loginHarness({ saved = true, busy = false, validationGate } = {}) {
  const actualForm = require('react-hook-form');
  const authCalls = [];
  const native = {
    StyleSheet: { create: (styles) => styles },
    Text: 'Text', TextInput: 'TextInput', View: 'View', ScrollView: 'ScrollView',
    KeyboardAvoidingView: 'KeyboardAvoidingView', TouchableOpacity: 'TouchableOpacity',
    ActivityIndicator: 'ActivityIndicator', Platform: { OS: 'android' },
    Keyboard: { dismiss() {} }, useColorScheme: () => 'light',
  };
  const config = load('src/theme/config.ts', { 'react-native': native });
  const { Button } = load('src/components/Button.tsx', {
    'react-native': native, '@/theme/config': config,
  });
  let form;
  const Screen = load('app/(auth)/login.tsx', {
    'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/theme/config': config,
    '@/components/Button': { Button },
    '@/components/Input': { Input: 'Input' },
    '@/store/authStore': { useAuthStore: (selector) => selector({
      setAuth: (...args) => { authCalls.push(args); return saved; },
    }) },
    'react-hook-form': {
      ...actualForm,
      useForm(options) {
        form = actualForm.useForm({
          ...options,
          resolver: async (...args) => {
            if (validationGate) await validationGate;
            return options.resolver(...args);
          },
        });
        return busy ? { ...form, formState: { errors: form.formState.errors, isSubmitting: true } } : form;
      },
    },
  });
  const tree = captureScreen(Screen.default);
  const buttonElement = findElement(tree, Button);
  const button = captureScreen(() => Button(buttonElement.props));
  return { form, tree, button, authCalls };
}

const settleForm = () => new Promise((resolve) => setImmediate(resolve));

test('login uses actual RHF/Zod validation for missing, malformed and oversized inputs', async () => {
  const invalid = [
    [null, undefined], [undefined, null], ['', ''], ['bad-email', '123456'],
    ['dev@example.com', '12345'], [123, {}],
    ['x'.repeat(1000000), '123456'], ['dev@example.com', 'x'.repeat(1000000)],
  ];
  for (const [email, password] of invalid) {
    const { form, button, authCalls } = loginHarness();
    form.setValue('email', email);
    form.setValue('password', password);
    button.props.onPress();
    await settleForm();
    assert.equal(authCalls.length, 0);
    assert.ok(form.getFieldState('email').error || form.getFieldState('password').error);
  }
});

test('login blocks same-frame spamming throughout delayed validation and supplies the exact mock session', async () => {
  let release;
  const validationGate = new Promise((resolve) => { release = resolve; });
  const { form, button, authCalls } = loginHarness({ validationGate });
  form.setValue('email', ' dev@example.com ');
  form.setValue('password', 'pass!✓');
  for (let i = 0; i < 50; i++) button.props.onPress();
  await settleForm();
  assert.equal(authCalls.length, 0);
  release();
  await settleForm();
  assert.equal(authCalls.length, 1);
  assert.equal(JSON.stringify(authCalls[0]), JSON.stringify([
    { id: '1', email: 'dev@example.com', name: 'Developer' }, 'mock-jwt-token',
  ]));
});

test('login disables the button and renders a spinner while submitting', () => {
  const { button } = loginHarness({ busy: true });
  assert.equal(button.props.disabled, true);
  assert.equal(button.props.accessibilityState.busy, true);
  assert.ok(findElement(button, 'ActivityIndicator'));
});

test('base Button suppresses presses when disabled or loading', () => {
  const native = {
    StyleSheet: { create: (styles) => styles },
    TouchableOpacity: 'TouchableOpacity', Text: 'Text', ActivityIndicator: 'ActivityIndicator',
    useColorScheme: () => 'light',
  };
  const config = load('src/theme/config.ts', { 'react-native': native });
  const { Button } = load('src/components/Button.tsx', { 'react-native': native, '@/theme/config': config });
  let calls = 0;
  for (const state of [{ disabled: true }, { loading: true }, {}]) {
    const element = captureScreen(() => Button({ title: 'Submit', onPress: () => { calls++; }, ...state }));
    assert.equal(element.props.activeOpacity, 0.8);
    element.props.onPress({});
  }
  assert.equal(calls, 1);
});

test('base Input handles invalid values and forwards focus/blur while displaying readable errors', () => {
  const native = {
    StyleSheet: { create: (styles) => styles },
    TextInput: 'TextInput', Text: 'Text', View: 'View', useColorScheme: () => 'light',
  };
  const config = load('src/theme/config.ts', { 'react-native': native });
  const { Input } = load('src/components/Input.tsx', { 'react-native': native, '@/theme/config': config });
  let focused = 0;
  let blurred = 0;
  for (const value of [null, 123, {}, undefined, 'hello!✓']) {
    const element = captureScreen(() => Input({
      label: 'Email', value, error: 'Enter a valid email address.',
      onFocus: () => { focused++; }, onBlur: () => { blurred++; },
    }));
    const field = findElement(element, 'TextInput');
    assert.ok(field.props.value === undefined || typeof field.props.value === 'string');
    assert.equal(field.props.accessibilityLabel, 'Email');
    assert.ok(JSON.stringify(element).includes('Enter a valid email address.'));
    field.props.onFocus({});
    field.props.onBlur({});
  }
  assert.equal(focused, 5);
  assert.equal(blurred, 5);
});

test('login shows a safe, readable session-storage failure without exposing credentials', async () => {
  const { form, button } = loginHarness({ saved: false });
  form.setValue('email', 'dev@example.com');
  form.setValue('password', 'secret123');
  button.props.onPress();
  await settleForm();
  assert.equal(form.getFieldState('root').error.message, 'Unable to save your session. Please try again.');
  assert.equal(form.getValues('password'), 'secret123');
});
