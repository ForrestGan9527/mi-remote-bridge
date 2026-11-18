'use strict';

const { createBridgeServer } = require('./lib/bridge-server');

async function main() {
  const bridge = await createBridgeServer({
    dataDir: process.env.DATA_DIR || undefined,
    certDir: process.env.CERT_DIR || undefined,
    certFile: process.env.CERT_FILE || undefined,
    keyFile: process.env.KEY_FILE || undefined,
    helperPath: process.env.HELPER_PATH || undefined,
    systemBridgeAutoBuild: process.env.DISABLE_NATIVE_BUILD !== '1',
    https: process.env.HTTPS_DISABLED === '1' ? false : true,
    systemBridge: process.env.DISABLE_SYSTEM_BRIDGE === '1' ? false : true
  });
  let ports;
  try {
    ports = await bridge.start();
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `端口被占用。可改用其他端口启动，例如：PORT=3100 HTTPS_PORT=3543 npm start`
      );
    } else {
      console.error(`服务启动失败：${error.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const info = await bridge.getConnectInfo();
  const httpUrl = info.urls.find((item) => item.protocol === 'http')?.url || '';
  const httpsUrl = info.urls.find((item) => item.protocol === 'https')?.url || '';

  console.log('');
  console.log('  REMOTE BRIDGE  ·  遥控桥');
  console.log('  ─────────────────────────────────────────────');
  console.log(`  电脑接收端   http://localhost:${ports.httpPort}/pc`);
  if (ports.httpsAvailable) {
    console.log(`  手机遥控端   ${httpsUrl}  (推荐，支持语音)`);
    console.log(`  HTTP 备用    ${httpUrl}  (仅按键)`);
    console.log('');
    console.log('  👉 在电脑端页面扫描二维码，可直接打开手机端。');
    console.log('  🔐 首次使用自签名 HTTPS 时，请在手机上选择继续访问。');
  } else {
    console.log(`  手机遥控端   ${httpUrl}  (警告：当前环境无法录音)`);
    console.log('');
    console.log('  ⚠️  HTTPS 不可用。浏览器仅允许在 HTTPS 下访问麦克风。');
    console.log('     检查本机是否安装了 openssl，或查看 README 的手动证书步骤。');
  }
  console.log('  📶 手机和电脑需要连接同一个局域网 / Wi-Fi。');
  console.log('  ─────────────────────────────────────────────');
  console.log('  按 Ctrl+C 停止服务');
  console.log('');

  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`\n收到 ${signal}，正在关闭服务…`);
    try {
      await bridge.stop();
    } catch (error) {
      console.error(`关闭服务时出错：${error.message}`);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
