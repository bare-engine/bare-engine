const { createRequire } = require("module");
const path = require("path");

module.exports = createRequire(path.join(process.cwd(), "package.json"));
