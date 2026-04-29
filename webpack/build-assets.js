const { AssetPack } = require('@pixi/assetpack');
const path = require('path');

async function build() {
  const pack = new AssetPack({
    config: path.resolve(__dirname, '../assetpack.config.json'),
  });

  await pack.run();
}

build();
