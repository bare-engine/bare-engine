const { AssetPack } = require("@pixi/assetpack");
const path = require("node:path");

async function build() {
    const pack = new AssetPack({
        config: path.resolve(process.cwd(), "assetpack.config.json")
    });

    await pack.run();
}

build();
