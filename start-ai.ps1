$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $root ".env"

if (!(Test-Path $envFile)) {
  Copy-Item (Join-Path $root ".env.example") $envFile
}

$content = Get-Content -LiteralPath $envFile -Raw -Encoding UTF8
if ($content -match "把你的OpenAI_API_Key粘贴到这里") {
  Write-Host ""
  Write-Host "请先打开 $envFile，把 OPENAI_API_KEY= 后面的占位文字替换成你的真实 Key。"
  Write-Host "不要把 Key 发到聊天里，保存在本机 .env 文件即可。"
  Write-Host ""
  exit 1
}

Set-Location $root
node server.js
