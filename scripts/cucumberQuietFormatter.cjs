const Formatter = require("../node_modules/@cucumber/cucumber/lib/formatter/index.js").default;

class QuietFormatter extends Formatter
{
}

module.exports = QuietFormatter;
