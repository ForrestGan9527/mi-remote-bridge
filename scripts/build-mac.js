'use strict';

/**
 * Builds a self-contained macOS menu-bar app:
 *   dist/Remote Bridge.app
 *   dist/RemoteBridge-<version>.dmg
 *
 * The bundle contains the Node runtime, the server, the web UI and the
 * prebuilt RemoteBridgeHelper. User data and generated certificates live in
 * ~/Library/Application Support/RemoteBridge so the app can stay read-only.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = pkg.version || '1.0.0';
const buildDmg = process.argv.includes('--dmg');
const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
const appName = 'Remote Bridge';
const bundleId = 'com.remotebridge.mac';
const distDir = path.join(rootDir, 'dist');
const buildDir = path.join(distDir, 'build');
const appPath = path.join(distDir, `${appName}.app`);
const contentsDir = path.join(appPath, 'Contents');
const resourcesDir = path.join(contentsDir, 'Resources');
const appResourcesDir = path.join(resourcesDir, 'app');
const runtimeDir = path.join(resourcesDir, 'runtime');
const dmgPath = path.join(distDir, `RemoteBridge-${version}.dmg`);
const signingDir = path.join(rootDir, '.signing');
const signingKeychain = path.join(signingDir, 'RemoteBridgeSigning.keychain-db');
const signingIdentity = 'Remote Bridge Local';

function log(message) {
  console.log(`[build:mac] ${message}`);
}

function fail(message) {
  console.error(`[build:mac] ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: options.stdio || 'inherit',
    timeout: options.timeout || 180_000,
    encoding: 'utf8'
  });
  if (result.error || result.status !== 0) {
    const detail = result.error
      ? result.error.message
      : (result.stderr || result.stdout || '').trim();
    fail(`${command} 执行失败：${detail || `退出码 ${result.status}`}`);
  }
  return result;
}

function copy(src, dest) {
  fs.cpSync(src, dest, {
    recursive: true,
    dereference: false,
    preserveTimestamps: true
  });
}

function writeInfoPlist() {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>zh_CN</string>
  <key>CFBundleDisplayName</key>
  <string>遥控桥</string>
  <key>CFBundleExecutable</key>
  <string>RemoteBridge</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleIdentifier</key>
  <string>${bundleId}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${appName}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${version}</string>
  <key>CFBundleVersion</key>
  <string>${version}</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSMicrophoneUsageDescription</key>
  <string>用于把手机语音送入本机虚拟麦克风。</string>
  <key>NSSpeechRecognitionUsageDescription</key>
  <string>用于在 Mac 本机把手机语音识别成文字。</string>
</dict>
</plist>
`;
  fs.writeFileSync(path.join(contentsDir, 'Info.plist'), plist, 'utf8');
}

function buildIcon() {
  const sourceSvg = path.join(rootDir, 'public', 'favicon.svg');
  const iconset = path.join(buildDir, 'AppIcon.iconset');
  const master = path.join(buildDir, 'icon-1024.png');
  fs.rmSync(iconset, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.mkdirSync(iconset, { recursive: true });

  const masterResult = spawnSync(
    'sips',
    ['-s', 'format', 'png', '-z', '1024', '1024', sourceSvg, '--out', master],
    { encoding: 'utf8' }
  );
  if (masterResult.error || masterResult.status !== 0 || !fs.existsSync(master)) {
    log('图标生成失败，将使用系统默认图标');
    return null;
  }

  const variants = [
    [16, 'icon_16x16.png'],
    [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'],
    [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'],
    [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'],
    [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'],
    [1024, 'icon_512x512@2x.png']
  ];
  for (const [size, name] of variants) {
    const result = spawnSync('sips', ['-z', String(size), String(size), master, '--out', path.join(iconset, name)], {
      encoding: 'utf8'
    });
    if (result.error || result.status !== 0) {
      log('图标缩放失败，将使用系统默认图标');
      return null;
    }
  }

  const icns = path.join(resourcesDir, 'AppIcon.icns');
  const iconResult = spawnSync('iconutil', ['-c', 'icns', iconset, '-o', icns], { encoding: 'utf8' });
  if (iconResult.error || iconResult.status !== 0) {
    log('图标打包失败，将使用系统默认图标');
    return null;
  }
  return icns;
}

function compileLauncher() {
  const source = path.join(rootDir, 'native', 'AppLauncher.swift');
  const output = path.join(contentsDir, 'MacOS', 'RemoteBridge');
  if (!fs.existsSync(source)) fail('缺少 native/AppLauncher.swift');
  log('编译菜单栏启动器…');
  run('swiftc', [
    '-swift-version', '5',
    '-O',
    '-target', `${arch}-apple-macos13.0`,
    source,
    '-o', output,
    '-framework', 'AppKit'
  ]);
  fs.chmodSync(output, 0o755);
}

function ensureSigningIdentity() {
  fs.mkdirSync(signingDir, { recursive: true, mode: 0o700 });
  const passwordPath = path.join(signingDir, 'keychain-password');
  const keyPath = path.join(signingDir, 'signing-key.pem');
  const certPath = path.join(signingDir, 'signing-cert.pem');

  let password = '';
  if (fs.existsSync(passwordPath)) {
    password = fs.readFileSync(passwordPath, 'utf8').trim();
  }
  if (!password) {
    password = crypto.randomBytes(24).toString('base64url');
    fs.writeFileSync(passwordPath, `${password}\n`, { mode: 0o600 });
  }

  const needsCreate = !fs.existsSync(signingKeychain)
    || !fs.existsSync(keyPath)
    || !fs.existsSync(certPath);
  if (needsCreate) {
    log('生成本地代码签名身份（仅用于本机，不会上传）…');
    fs.rmSync(keyPath, { force: true });
    fs.rmSync(certPath, { force: true });
    if (fs.existsSync(signingKeychain)) {
      spawnSync('security', ['delete-keychain', signingKeychain], { encoding: 'utf8' });
    }
    run('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', keyPath,
      '-out', certPath,
      '-days', '3650',
      '-subj', `/CN=${signingIdentity}`,
      '-addext', 'keyUsage=critical,digitalSignature',
      '-addext', 'extendedKeyUsage=codeSigning',
      '-addext', 'basicConstraints=critical,CA:TRUE'
    ], { stdio: 'ignore' });
    run('security', ['create-keychain', '-p', password, signingKeychain], { stdio: 'ignore' });
    run('security', ['set-keychain-settings', '-lut', '21600', signingKeychain], { stdio: 'ignore' });
    run('security', ['unlock-keychain', '-p', password, signingKeychain], { stdio: 'ignore' });
    run('security', ['import', keyPath, '-k', signingKeychain, '-T', '/usr/bin/codesign', '-P', ''], { stdio: 'ignore' });
    run('security', ['import', certPath, '-k', signingKeychain, '-T', '/usr/bin/codesign', '-P', ''], { stdio: 'ignore' });
    run('security', [
      'set-key-partition-list',
      '-S', 'apple-tool:,apple:,codesign:',
      '-s', '-k', password,
      signingKeychain
    ], { stdio: 'ignore' });
  } else {
    run('security', ['unlock-keychain', '-p', password, signingKeychain], { stdio: 'ignore' });
  }

  return { keychain: signingKeychain, identity: signingIdentity, certPath };
}

function createHelperApp(helperSource) {
  const helperApp = path.join(appResourcesDir, 'native', 'RemoteBridgeHelper.app');
  const macosDir = path.join(helperApp, 'Contents', 'MacOS');
  fs.mkdirSync(macosDir, { recursive: true });
  const executable = path.join(macosDir, 'RemoteBridgeHelper');
  fs.copyFileSync(helperSource, executable);
  fs.chmodSync(executable, 0o755);
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>zh_CN</string>
  <key>CFBundleDisplayName</key>
  <string>遥控桥辅助</string>
  <key>CFBundleExecutable</key>
  <string>RemoteBridgeHelper</string>
  <key>CFBundleIdentifier</key>
  <string>com.remotebridge.helper</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Remote Bridge Helper</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${version}</string>
  <key>CFBundleVersion</key>
  <string>${version}</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSMicrophoneUsageDescription</key>
  <string>用于把手机语音送入本机虚拟麦克风。</string>
  <key>NSSpeechRecognitionUsageDescription</key>
  <string>用于在 Mac 本机把手机语音识别成文字。</string>
</dict>
</plist>
`;
  fs.writeFileSync(path.join(helperApp, 'Contents', 'Info.plist'), plist, 'utf8');
  return helperApp;
}

function signTarget(target, identifier, signing) {
  log(`签名 ${path.basename(target)}…`);
  const result = spawnSync(
    'codesign',
    [
      '--force',
      '--sign', signing.identity,
      '--keychain', signing.keychain,
      '--identifier', identifier,
      '--timestamp=none',
      target
    ],
    { encoding: 'utf8', timeout: 180_000 }
  );
  if (result.error || result.status !== 0) {
    log(`签名失败：${(result.stderr || result.error?.message || '').trim()}`);
    return false;
  }
  return true;
}

function describeRequirement(target) {
  const result = spawnSync('codesign', ['-dr', '-', target], { encoding: 'utf8' });
  const output = (result.stderr || result.stdout || '').trim();
  log(output.split('\n').pop() || output);
  return /certificate leaf/.test(output);
}

function signBundle() {
  const signing = ensureSigningIdentity();
  const helperApp = path.join(appResourcesDir, 'native', 'RemoteBridgeHelper.app');
  const stableHelper = signTarget(helperApp, 'com.remotebridge.helper', signing);
  const stableNode = signTarget(path.join(runtimeDir, 'node'), 'com.remotebridge.node', signing);
  const stableApp = signTarget(appPath, 'com.remotebridge.mac', signing);

  if (stableHelper && stableNode && stableApp) {
    log('签名身份稳定，辅助功能授权在重新打包后可继续使用；');
    describeRequirement(helperApp);
    describeRequirement(appPath);
    return;
  }

  log('稳定签名失败，回退到临时签名；每次重新打包后需要重新授权辅助功能。');
  for (const target of [helperApp, path.join(runtimeDir, 'node'), appPath]) {
    spawnSync('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', target], {
      encoding: 'utf8',
      timeout: 180_000
    });
  }
}

function createDmg() {
  log('生成安装镜像…');
  const staging = path.join(buildDir, 'dmg');
  fs.rmSync(staging, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.mkdirSync(staging, { recursive: true });
  fs.cpSync(appPath, path.join(staging, `${appName}.app`), { recursive: true, preserveTimestamps: true });
  try {
    fs.symlinkSync('/Applications', path.join(staging, 'Applications'));
  } catch {
    // The symlink is a convenience only.
  }
  fs.rmSync(dmgPath, { force: true });
  run('hdiutil', [
    'create',
    '-volname', appName,
    '-srcfolder', staging,
    '-ov',
    '-format', 'UDZO',
    dmgPath
  ], { timeout: 300_000 });
}

function main() {
  if (process.platform !== 'darwin') {
    fail('macOS 应用只能在 macOS 上打包');
  }
  if (!['arm64', 'x64'].includes(process.arch)) {
    fail(`暂不支持当前架构：${process.arch}`);
  }

  log(`开始打包 ${appName} ${version} (${arch})`);
  if (!fs.existsSync(path.join(rootDir, 'node_modules', 'express'))) {
    fail('缺少运行依赖，请先执行 npm install');
  }

  log('编译本机桥接…');
  run(process.execPath, [path.join(rootDir, 'scripts', 'build-native.js')]);

  fs.mkdirSync(distDir, { recursive: true });
  const staleTargets = [appPath, buildDir];
  if (buildDmg) staleTargets.push(dmgPath);
  for (const stale of staleTargets) {
    fs.rmSync(stale, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  fs.mkdirSync(path.join(contentsDir, 'MacOS'), { recursive: true });
  fs.mkdirSync(resourcesDir, { recursive: true });
  fs.mkdirSync(appResourcesDir, { recursive: true });
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.mkdirSync(buildDir, { recursive: true });

  writeInfoPlist();
  buildIcon();
  compileLauncher();

  log('复制 Node 运行时…');
  const nodeSource = fs.realpathSync(process.execPath);
  fs.copyFileSync(nodeSource, path.join(runtimeDir, 'node'));
  fs.chmodSync(path.join(runtimeDir, 'node'), 0o755);

  log('复制服务端、页面与依赖…');
  for (const entry of ['server.js', 'package.json', 'package-lock.json', 'README.md']) {
    const source = path.join(rootDir, entry);
    if (fs.existsSync(source)) copy(source, path.join(appResourcesDir, entry));
  }
  copy(path.join(rootDir, 'lib'), path.join(appResourcesDir, 'lib'));
  copy(path.join(rootDir, 'public'), path.join(appResourcesDir, 'public'));
  const nodeModulesSource = path.join(rootDir, 'node_modules');
  const binDir = path.join(nodeModulesSource, '.bin');
  fs.cpSync(nodeModulesSource, path.join(appResourcesDir, 'node_modules'), {
    recursive: true,
    dereference: false,
    preserveTimestamps: true,
    filter: (source) => source !== binDir && !source.startsWith(`${binDir}${path.sep}`)
  });

  const helperSource = path.join(rootDir, 'native', '.build', 'RemoteBridgeHelper');
  if (!fs.existsSync(helperSource)) fail('本机桥接编译产物缺失');
  createHelperApp(helperSource);

  signBundle();
  if (buildDmg) createDmg();

  log('');
  log(`完成：${appPath}`);
  if (buildDmg) {
    log(`安装镜像：${dmgPath}`);
    log('把 .app 拖进“应用程序”即可使用；首次打开若被拦截，请右键 → 打开。');
  } else {
    log('未生成 DMG；需要安装镜像时执行 npm run build:dmg');
  }
}

main();
