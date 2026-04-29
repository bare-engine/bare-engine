module.exports = {
  default: {
    paths: ["features/**/*.feature"],
    require: ["features/**/*.cjs"],
    format: ["./scripts/cucumberQuietFormatter.cjs"],
    publishQuiet: true,
  },
};
