'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const sourcePath = path.join(rootDir, 'native', 'RemoteBridgeHelper.swift');
const buildDir = path.join(rootDir, 'native', '.build');
const outputPath = path.join(buildDir, 'RemoteBridgeHelper');

if (process.platform !== 'darwin') {
  console.log('本机系统桥接仅支持 macOS，跳过编译。');
  process.exit(0);
}

fs.mkdirSync(buildDir, { recursive: true });
const architecture = process.arch === 'arm64' ? 'arm64' : 'x86_64';
const result = spawnSync(
  'swiftc',
  [
    '-swift-version', '5',
    '-O',
    '-target', `${architecture}-apple-macos13.0`,
    sourcePath,
    '-o', outputPath,
    '-framework', 'AppKit',
    '-framework', 'AVFoundation',
    '-framework', 'CoreAudio',
    '-framework', 'AudioToolbox',
    '-framework', 'ApplicationServices'
  ],
  { stdio: 'inherit', timeout: 90_000 }
);

if (result.error || result.status !== 0) {
  console.error('本机桥接编译失败，请确认已安装 Xcode Command Line Tools。');
  process.exit(result.status || 1);
}

spawnSync('codesign', ['--force', '--sign', '-', outputPath], {
  stdio: 'ignore',
  timeout: 15_000
});
console.log(`本机桥接已生成：${outputPath}`);
