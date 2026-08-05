/**
 * Must be imported first — stubs `server-only` so pipeline modules can load under tsx.
 */
import { createRequire } from "module";
import { pathToFileURL } from "url";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");

require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  children: [],
  paths: [],
  parent: null,
  isPreloading: false,
  require,
  path: serverOnlyPath,
} as NodeModule;

// Also cover the package entry used by some resolvers
try {
  const pkg = require.resolve("server-only/package.json");
  void pkg;
} catch {
  // ignore
}

void pathToFileURL;
