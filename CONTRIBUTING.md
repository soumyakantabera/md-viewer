# Contributing

Thanks for helping! The project is intentionally small.

1. Fork and clone, then follow *Build from source* in the README (`npm ci`, `./cpp/build.sh`).
2. The UI is `src/viewer.html` (markup, CSS) and `src/app.js` (logic). Features needing the OS (files, dialogs, export) go in `cpp/main.cpp`
   and are exposed to the page through the `window.mdv` shim in that file.
3. Keep the bridge minimal: add one explicit function per capability.
4. Try your change with `examples/demo.md`, `examples/latex.md` and `examples/code.md` in light, dark and sepia.
5. Run `npm run test:ui` (see README > Tests) and extend `tests/ui/run.js` for new features, especially anything that touches untrusted content.
   `cpp/core.h` has a self-test (`cpp/selftest.cpp`); extend it when you change host helper code.
6. Open a pull request describing what changed and how you tested it.

Please don't commit `node_modules/`, `cpp/dist/` or `src/lib/` (they are generated).
