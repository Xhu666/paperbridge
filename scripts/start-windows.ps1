$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
try {
    if (-not [Environment]::Is64BitOperatingSystem) { throw 'This launcher requires 64-bit Windows.' }
    $root = Split-Path $PSScriptRoot -Parent
    Set-Location -LiteralPath $root
    Write-Host '[1/5] Checking Node.js and npm...'
    $node = Get-Command node -ErrorAction SilentlyContinue
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    $valid = $false
    if ($node -and $npm) {
        & $node.Source -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(process.arch==="x64"&&(a>22||(a===22&&b>=12))?0:1)'
        $valid = $LASTEXITCODE -eq 0
    }
    if ($valid) {
        $nodePath = $node.Source
    } else {
        $cache = Join-Path $root '.cache\startup'
        $nodePath = Join-Path $cache 'node\node.exe'
        if (-not (Test-Path -LiteralPath $nodePath)) {
            if ($args -contains '--check') { throw 'Node.js/npm is missing. Check mode does not download; run without --check to install.' }
            New-Item -ItemType Directory -Force -Path $cache | Out-Null
            Write-Host 'Installing project-local Node.js 22 and npm. Download progress shows Time Left.'
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            $checksums = (Invoke-WebRequest -UseBasicParsing 'https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt').Content
            $match = [regex]::Match($checksums, '(?m)^([a-f0-9]{64})\s+(node-v[^\s]+-win-x64\.zip)\s*$')
            if (-not $match.Success) { throw 'Cannot find the Windows x64 Node.js archive.' }
            $file = $match.Groups[2].Value
            $archive = Join-Path $cache $file
            & curl.exe -fL -C - --retry 3 --connect-timeout 30 -o $archive "https://nodejs.org/dist/latest-v22.x/$file"
            if ($LASTEXITCODE -ne 0) { throw 'Node.js download failed. Run again to resume.' }
            if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $match.Groups[1].Value) { throw 'Node.js checksum mismatch.' }
            Write-Host 'Extracting Node.js and npm...'
            Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $cache 'node-unpack') -Force
            $directory = $file.Substring(0, $file.Length - 4)
            Move-Item -LiteralPath (Join-Path $cache "node-unpack\$directory") -Destination (Join-Path $cache 'node')
        }
        $env:PATH = "$(Split-Path $nodePath);$env:PATH"
    }
    & $nodePath 'scripts/start.mjs' @args
    exit $LASTEXITCODE
} catch {
    Write-Host $_ -ForegroundColor Red
    exit 1
}
