import pkg from "../package.json";

// Single source of truth for the app version: package.json. Bump it there and the UI follows.
export const VERSION = pkg.version;
