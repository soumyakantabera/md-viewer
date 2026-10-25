// Creates the Markdown fixtures used by run.js
const fs=require('fs'),path=require('path');
exports.make=R=>{const P=path.join(R,'proj'),w=(p,t)=>{fs.mkdirSync(path.dirname(path.join(R,p)),{recursive:true});fs.writeFileSync(path.join(R,p),t)};
 fs.rmSync(R,{recursive:true,force:true});
 w('proj/evil.md',`# Security

<img src="x" onerror="window.__xss1=1">

<script>window.__xss2=1</script>

<svg onload="window.__xss3=1"><circle r="5"/></svg>

<iframe src="https://evil.example/"></iframe>

<style>body{display:none}</style>

<form action="https://evil.example"><input name="a"></form>

[js link](javascript:window.__xss4=1)

<a href="javascript:window.__xss5=1" onclick="window.__xss6=1">click</a>

<img src=x title="$onerror=window.__xss7=1//$" alt="$a$">

<div onmouseover="window.__xss8=1" style="position:fixed;inset:0">overlay</div>

<a href="https://example.com/page">External</a> <a href="mailto:a@b.c">Mail</a> <a href="#my-section">Jump</a>

## My Section

[Rel](other.md) and [Out](../outside/secret.md)
`);
 w('proj/other.md','# Other doc\n\nreached via link\n');w('outside/secret.md','# Secret\n\ntop secret\n');w('proj/.hidden.md','x');w('proj/plain.md','# Plain\n\njust text\n');
 w('proj/features.md',`---
title: Feature test
tags: [alpha, beta]
---

# Feature Test

Emoji :rocket: and \`:smile:\` in code stays. Footnote here.[^n]

## My Section

- [ ] first task
- [x] second task

Inline $a_1 + b^2$ and display:

$$\\int_0^1 x\\,dx$$

\`\`\`python
def f(x):
    return x  # comment
\`\`\`

## Section Two

[^n]: The footnote text.
`);
 w('proj/diagram.md','# Diagram\n\n```mermaid\nflowchart LR\n  A-->B\n```\n');
 w('proj/sub/alpha.md','# Alpha\n\nneedle in alpha\n');w('proj/beta.md','# Beta\n\nanother NEEDLE line\n');
 w('proj/deck.md','# Deck\n\nintro\n\n## One\n\nfirst\n\n## Two\n\nsecond\n\n## Three\n\nthird\n');w('proj/edit.md','# Other doc\n\nbody\n');
 let big='';for(let i=0;i<1500;i++)big+=`## Section ${i}\n\nParagraph ${i} with **bold**, \`code\` and math $x_${i}^2$.\n\n\`\`\`js\nconst a${i} = ${i};\n\`\`\`\n\n`;w('proj/big.md',big);
 return {R,P}};
