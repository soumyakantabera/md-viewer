// Copies the browser builds of marked, mermaid, KaTeX and highlight.js from node_modules into src/lib
// (src/lib is git-ignored; this runs automatically after `npm install`).
const fs = require('fs'), path = require('path');
const nm = p => path.join(__dirname, '..', 'node_modules', p);
const out = path.join(__dirname, '..', 'src', 'lib');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });
const files = {
  'marked/marked.min.js': 'marked.min.js',
  'mermaid/dist/mermaid.min.js': 'mermaid.min.js',
  'katex/dist/katex.min.js': 'katex.min.js',
  'katex/dist/katex.min.css': 'katex.min.css',
  '@highlightjs/cdn-assets/highlight.min.js': 'highlight.min.js',
  'dompurify/dist/purify.min.js': 'purify.min.js',
  'marked-footnote/dist/index.umd.js': 'marked-footnote.min.js',
};
for (const [from, to] of Object.entries(files)) fs.copyFileSync(nm(from), path.join(out, to));
const fonts = nm('katex/dist/fonts');
for (const f of fs.readdirSync(fonts)) if (f.endsWith('.woff2')) fs.copyFileSync(path.join(fonts, f), path.join(out, 'fonts', f));
// Extra highlight.js languages (not in the default "common" bundle), concatenated into one file
const extra = ['powershell','dockerfile','nginx','makefile','latex','haskell','scala','dart','elixir','groovy','cmake','protobuf','graphql','julia','clojure','erlang','nix','vim'];
fs.writeFileSync(path.join(out, 'hljs-extra.min.js'),
  extra.map(n => fs.readFileSync(nm('@highlightjs/cdn-assets/languages/' + n + '.min.js'), 'utf8')).join('\n'));
console.log('vendored libraries into src/lib');
