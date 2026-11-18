'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  defaultConfig,
  normalizeConfigUpdate,
  normalizeStoredConfig
} = require('./default-config');

class ConfigStore {
  constructor({ dataDir, logger = console }) {
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, 'config.json');
    this.logger = logger;
    this.config = defaultConfig();
  }

  load() {
    fs.mkdirSync(this.dataDir, { recursive: true });

    let raw = null;
    try {
      raw = fs.readFileSync(this.filePath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    if (raw !== null) {
      try {
        this.config = normalizeStoredConfig(JSON.parse(raw));
        return this.get();
      } catch (error) {
        const backup = `${this.filePath}.corrupt-${Date.now()}`;
        try {
          fs.renameSync(this.filePath, backup);
        } catch {
          // The invalid config is still ignored even if it cannot be backed up.
        }
        this.logger.warn(`[config] 配置文件损坏，已重置：${error.message}`);
      }
    }

    this.config = defaultConfig();
    this.#write(this.config);
    return this.get();
  }

  get() {
    return structuredClone(this.config);
  }

  update(input) {
    const normalized = normalizeConfigUpdate(input, this.config);
    const next = {
      version: 1,
      revision: this.config.revision + 1,
      updatedAt: new Date().toISOString(),
      voiceTrigger: normalized.voiceTrigger,
      layout: normalized.layout,
      customKeys: normalized.customKeys,
      hiddenKeys: normalized.hiddenKeys,
      keys: normalized.keys
    };
    this.#write(next);
    this.config = next;
    return this.get();
  }

  #write(config) {
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    const payload = `${JSON.stringify(config, null, 2)}\n`;
    try {
      fs.writeFileSync(tempPath, payload, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tempPath, this.filePath);
    } catch (error) {
      try {
        fs.rmSync(tempPath, { force: true });
      } catch {
        // Best-effort cleanup only.
      }
      throw error;
    }
  }
}

module.exports = { ConfigStore };
