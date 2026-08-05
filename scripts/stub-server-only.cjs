/** Preload stub so tsx scripts can import server-only modules. */
const Module = require("module");
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === "server-only") return {};
  return originalRequire.apply(this, arguments);
};
