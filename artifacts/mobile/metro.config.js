const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
  /.*\/protobufjs\/[^/]+_tmp_[^/]+\/.*/,
];

module.exports = config;
