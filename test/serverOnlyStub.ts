// `server-only` exists purely to fail the build when a module is pulled into
// a client bundle. Under Vitest everything runs on the server, so it is a
// no-op — aliased in vitest.config.ts.
export {};
