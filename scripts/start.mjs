import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { delimiter, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const checkOnly = process.argv.includes('--check');
const noBrowser = process.argv.includes('--no-browser') || checkOnly;
const cache = resolve(root, '.cache/startup');
const texPackages = ['xetex', 'ctex', 'fandol', 'xecjk', 'amsmath', 'amsfonts', 'graphics', 'tools', 'natbib', 'booktabs', 'geometry', 'hyperref', 'caption', 'float', 'multirow', 'adjustbox', 'enumitem', 'ulem', 'makecell', 'txfonts'];
const texFiles = ['ctex.sty', 'xeCJK.sty', 'FandolSong-Regular.otf', 'FandolHei-Regular.otf', 'amsmath.sty', 'amssymb.sty', 'graphicx.sty', 'natbib.sty', 'booktabs.sty', 'geometry.sty'];

function command(file, args, options = {}) {
  if (process.platform === 'win32' && /\.(bat|cmd)$/i.test(file)) {
    const quote = value => "'" + value.replaceAll("'", "''") + "'";
    return command('powershell.exe', ['-NoProfile', '-Command', `& ${quote(file)} ${args.map(quote).join(' ')}; exit $LASTEXITCODE`], options);
  }
  return new Promise((accept, reject) => {
    const child = spawn(file, args, { cwd: root, stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code, signal) => code === 0 ? accept() : reject(Error(`${file} 退出（${signal || code}）`)));
  });
}

async function available(path) {
  try { await access(path); return true; } catch { return false; }
}

async function works(file, args) {
  try { await command(file, args, { stdio: 'ignore' }); return true; } catch { return false; }
}

async function prepareDependencies() {
  console.log(`[2/5] 检查项目依赖 · Node.js ${process.version} · ${process.platform}/${process.arch}`);
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const imports = ['cheerio', 'diff', 'jszip', 'pdf-parse', '@napi-rs/canvas', 'vite'];
  const probe = ['--input-type=module', '-e', `await Promise.all(${JSON.stringify(imports)}.map(name => import(name)))`];
  if (!await works(npm, ['ls', '--all', '--include=dev']) || !await works(process.execPath, probe)) {
    if (checkOnly) throw Error('项目依赖缺失或不兼容；正常双击启动可自动安装');
    console.log('发现缺失、版本不匹配或平台不兼容的依赖，执行 npm install：');
    await command(npm, ['install', '--include=dev', '--no-audit', '--no-fund', '--loglevel=info']);
    await command(process.execPath, probe);
  } else console.log('依赖完整且符合当前系统，无需安装。');
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  for (const name of [...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)]) {
    const installed = JSON.parse(await readFile(resolve(root, 'node_modules', name, 'package.json'), 'utf8'));
    console.log(`  已就绪 ${name}@${installed.version}`);
  }
}

async function texReady() {
  return await works('xelatex', ['--version']) && await works('kpsewhich', texFiles);
}

async function prepareTex() {
  console.log('[3/5] 检查 XeLaTeX、中文字体和排版宏包…');
  const texRoot = resolve(cache, 'tex');
  const texPlatform = process.platform === 'win32' ? 'windows' : 'universal-darwin';
  const bin = resolve(texRoot, 'TinyTeX/bin', texPlatform);
  const localCompiler = resolve(bin, process.platform === 'win32' ? 'xelatex.exe' : 'xelatex');
  if (await available(localCompiler)) process.env.PATH = `${bin}${delimiter}${process.env.PATH || ''}`;
  if (process.platform === 'darwin') process.env.PATH += `${delimiter}/Library/TeX/texbin`;
  if (!await texReady()) {
    if (checkOnly) throw Error('PDF 排版环境缺失；正常双击启动可自动安装');
    await mkdir(texRoot, { recursive: true });
    const tlmgr = resolve(bin, process.platform === 'win32' ? 'tlmgr.bat' : 'tlmgr');
    if (!await available(tlmgr)) {
      const filename = process.platform === 'win32' ? 'TinyTeX-1-windows.exe' : 'TinyTeX-1-darwin.tar.xz';
      const archive = resolve(cache, filename);
      console.log('下载项目专用 TinyTeX；不修改已有系统 TeX。进度表 Time Left 为预计剩余时间。');
      await command(process.platform === 'win32' ? 'curl.exe' : 'curl', ['-fL', '-C', '-', '--retry', '3', '--connect-timeout', '30', '-o', archive, `https://github.com/rstudio/tinytex-releases/releases/download/daily/${filename}`]);
      console.log('解压 TinyTeX，首次准备可能需要几分钟…');
      const started = Date.now();
      const timer = setInterval(() => console.log(`  解压中，已用时 ${Math.round((Date.now() - started) / 1000)} 秒…`), 5000);
      try {
        if (process.platform === 'win32') await command(archive, ['-y', `-o${texRoot}`]);
        else await command('tar', ['-xf', archive, '-C', texRoot]);
      } finally { clearInterval(timer); }
    }
    process.env.PATH = `${bin}${delimiter}${process.env.PATH || ''}`;
    console.log(`补齐排版依赖：${texPackages.join(', ')}\n下方由 TeX 包管理器显示各宏包安装过程。`);
    await command(tlmgr, ['install', ...texPackages]);
    if (!await texReady()) throw Error('TeX 安装后检查未通过，请查看上方安装日志');
  } else console.log('已有排版环境完整，无需下载或安装。');
  const probe = resolve(cache, 'check');
  await mkdir(probe, { recursive: true });
  await writeFile(resolve(probe, 'check.tex'), String.raw`\documentclass[UTF8,fontset=fandol]{ctexart}
\usepackage{amsmath,amssymb,graphicx,natbib,booktabs}
\begin{document}PaperBridge 中文排版检查。$E=mc^2$\end{document}`);
  await command('xelatex', ['-no-shell-escape', '-interaction=batchmode', '-halt-on-error', 'check.tex'], { cwd: probe, env: { ...process.env, openin_any: 'p', openout_any: 'p' } });
  console.log('中文、公式、参考文献依赖的真实 PDF 编译检查通过。');
}

function freePort(port) {
  return new Promise((accept, reject) => {
    const socket = createServer();
    socket.on('error', error => error.code === 'EADDRINUSE' ? accept(false) : reject(error));
    socket.listen(port, '127.0.0.1', () => socket.close(() => accept(true)));
  });
}

async function start() {
  if (!['darwin', 'win32'].includes(process.platform)) throw Error('此启动脚本支持 Windows 和 macOS');
  console.log('PaperBridge：检查现有环境，仅补齐缺失依赖；本地安装保存在 .cache/startup/。');
  await prepareDependencies();
  await prepareTex();
  console.log('[4/5] 检查 TypeScript 并构建前端…');
  await command(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);
  if (checkOnly) { console.log('全部检查通过（--check：不安装依赖、不启动服务）。'); return; }
  if (await available('.env')) process.loadEnvFile('.env');
  const requested = Number(process.env.PORT || 5190);
  if (!Number.isInteger(requested) || requested < 1 || requested > 65535) throw Error('PORT 必须是 1～65535 的整数');
  let port = requested;
  while (!await freePort(port)) {
    if (++port > Math.min(requested + 20, 65535)) throw Error('连续 20 个端口被占用，请关闭旧服务或在 .env 中设置 PORT');
  }
  if (port !== requested) console.log(`端口 ${requested} 已占用，改用 ${port}。`);
  const url = `http://127.0.0.1:${port}`;
  console.log('[5/5] 启动后端及前端…');
  const child = spawn(process.execPath, ['server/index.mjs', '--production'], { cwd: root, stdio: 'inherit', env: { ...process.env, PORT: String(port) } });
  let ended = false;
  const closed = new Promise((accept, reject) => {
    child.on('error', error => { ended = true; reject(error); });
    child.on('exit', code => { ended = true; accept(code); });
  });
  closed.catch(() => {});
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { if (!ended) child.kill(signal); });
  try {
    const deadline = Date.now() + 30000;
    for (;;) {
      if (ended) throw Error('服务启动失败，请查看上方日志');
      try {
        const response = await fetch(`${url}/api/config`, { signal: AbortSignal.timeout(1000) });
        if (response.ok && typeof (await response.json()).configured === 'boolean') break;
      } catch { /* 等待服务监听 */ }
      if (Date.now() > deadline) throw Error('服务 30 秒内未就绪，请查看上方日志');
      await new Promise(accept => setTimeout(accept, 250));
    }
    console.log(`\n启动成功！前端地址：${url}\n请保留此窗口；按 Ctrl+C 停止服务。AI 功能需配置 API 并联网。\n`);
    if (!noBrowser) {
      try {
        if (process.platform === 'darwin') await command('open', [url]);
        else await command('powershell.exe', ['-NoProfile', '-Command', `Start-Process '${url}'`]);
      } catch { console.log(`浏览器未能自动打开，请手动访问 ${url}`); }
    }
    const code = await closed;
    if (code && code !== 130) throw Error(`服务退出（${code}）`);
  } catch (error) { if (!ended) child.kill(); throw error; }
}

try { await start(); }
catch (error) { console.error(`\n启动失败：${error.message}\n请保留上方日志；PDF 检查日志位于 .cache/startup/check/check.log。`); process.exitCode = 1; }
