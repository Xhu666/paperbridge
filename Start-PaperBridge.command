#!/bin/bash
set -e
cd "$(dirname "$0")"
trap 'code=$?; if [ "$code" -ne 0 ]; then echo "启动失败，请保留上方错误信息。按回车退出。"; read -r _; fi' EXIT
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
echo "[1/5] 检查 Node.js 和 npm…"
valid_node() {
  "$1" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)' 2>/dev/null
}
if command -v node >/dev/null && command -v npm >/dev/null && valid_node "$(command -v node)"; then
  NODE="$(command -v node)"
else
  case "$(uname -s)/$(uname -m)" in
    Darwin/arm64) NODE_TARGET=darwin-arm64 ;;
    Darwin/x86_64) NODE_TARGET=darwin-x64 ;;
    *) echo "此入口支持 macOS；Windows 请使用 .bat 文件。"; exit 1 ;;
  esac
  CACHE="$PWD/.cache/startup"
  NODE="$CACHE/node/bin/node"
  if [ ! -x "$NODE" ] || ! valid_node "$NODE"; then
    for arg in "$@"; do
      if [ "$arg" = --check ]; then echo "缺少 Node.js/npm；检查模式不下载，请正常双击启动以补装。"; exit 1; fi
    done
    mkdir -p "$CACHE/node"
    echo "缺少 Node.js 22.12+ 或 npm，将安装到项目缓存，不修改系统。"
    echo "下载进度表中的 Time Left 为预计剩余时间。"
    curl -fL --connect-timeout 30 -o "$CACHE/SHASUMS256.txt" https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt
    NODE_FILE=$(awk -v target="$NODE_TARGET" '$2 ~ ("-" target "[.]tar[.]gz$") {print $2}' "$CACHE/SHASUMS256.txt")
    [ -n "$NODE_FILE" ] || { echo "未找到对应系统的 Node.js 下载。"; exit 1; }
    curl -fL -C - --retry 3 --connect-timeout 30 -o "$CACHE/$NODE_FILE" "https://nodejs.org/dist/latest-v22.x/$NODE_FILE"
    (cd "$CACHE"; awk -v name="$NODE_FILE" '$2==name' SHASUMS256.txt | shasum -a 256 -c -)
    echo "解压 Node.js 和 npm…"
    tar -xzf "$CACHE/$NODE_FILE" -C "$CACHE/node" --strip-components=1
  fi
  export PATH="$CACHE/node/bin:$PATH"
fi
"$NODE" scripts/start.mjs "$@"
