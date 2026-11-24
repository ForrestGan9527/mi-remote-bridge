'use strict';

const path = require('node:path');

const { LocalSpeech } = require('../lib/local-speech');

async function main() {
  const dataDir = process.env.DATA_DIR || path.resolve(__dirname, '..', 'data');
  const speech = new LocalSpeech({ dataDir, logger: console });
  let lastPercent = -1;
  speech.on('status', (status) => {
    if (status.state !== 'downloading' || !status.progress) return;
    const percent = status.progress.percent || 0;
    if (percent === lastPercent) return;
    lastPercent = percent;
    process.stdout.write(`\r下载 SenseVoice 模型：${percent}%`);
  });

  try {
    if (speech.getStatus().installed) {
      await speech.ensureReady();
      console.log(`模型已安装并加载：${speech.modelDir}`);
      return;
    }
    await speech.download();
    console.log(`\n模型已就绪：${speech.modelDir}`);
  } catch (error) {
    console.error(`\n模型准备失败：${error.message}`);
    process.exitCode = 1;
  }
}

main();
