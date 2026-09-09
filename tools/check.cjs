const fs = require('node:fs');
const vm = require('node:vm');
for (const file of fs.readdirSync('js').filter(f => f.endsWith('.js'))) {
  new vm.Script(fs.readFileSync('js/' + file, 'utf8'), { filename: file });
}
const html = fs.readFileSync('index.html', 'utf8');
// scripts come from <script src> and from the boot loader's ordered file list
const refs = [...html.matchAll(/<script src="([^"]+)"/g), ...html.matchAll(/\['(js\/[^']+)'/g)];
for (const [, src] of refs) {
  if (!src.startsWith('https:')&&!fs.existsSync(src)) throw new Error('Missing script: ' + src);
}
console.log('All scripts parse; HTML script paths exist.');
