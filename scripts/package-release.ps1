$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$stage = Join-Path $env:TEMP ('opencode\premio-release-' + [Guid]::NewGuid().ToString('N'))
$release = Join-Path $root 'release'
[System.IO.Directory]::CreateDirectory($stage) | Out-Null
[System.IO.Directory]::CreateDirectory($release) | Out-Null
try {
  $items = @('server', 'config', 'assets', 'img', 'scripts', 'tests', 'docs', 'deploy', 'index.html', 'admin.html', 'cupon.html', 'cartel.html', 'instalar.html', 'offline.html', 'manifest.webmanifest', 'sw.js', 'package.json', 'package-lock.json', 'README.md', 'CONTRIBUTING.md', 'Dockerfile', 'compose.production.json', '.dockerignore', '.env.example', '.env.production.example')
  foreach ($item in $items) { Copy-Item -LiteralPath (Join-Path $root $item) -Destination $stage -Recurse }
  [System.IO.Directory]::CreateDirectory((Join-Path $stage 'data')) | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $stage 'data\.gitkeep'), '')
  $file = Join-Path $release ('los-olivos-premio-' + $package.version + '.zip')
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $file -Force
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($file)
  try {
    foreach ($entry in $archive.Entries) {
      $name = $entry.FullName.Replace('\', '/')
      if ($name -match '(^|/)(node_modules|artifacts|backups|release)/' -or ($name -match '(^|/)data/(?!\.gitkeep$)' -and $name -ne 'data/') -or ($name -match '(^|/)\.env($|\.)' -and $name -notmatch '\.example$')) { throw ('Contenido privado en el paquete: ' + $name) }
    }
    foreach ($required in @('manifest.webmanifest', 'sw.js', 'instalar.html', 'Dockerfile', 'compose.production.json')) {
      if ($null -eq $archive.GetEntry($required)) { throw ('Falta un archivo de publicación: ' + $required) }
    }
  } finally { $archive.Dispose() }
  $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
  [System.IO.File]::WriteAllText(($file + '.sha256'), ($hash + '  ' + [System.IO.Path]::GetFileName($file) + [Environment]::NewLine))
  Write-Output $file
  Write-Output ('SHA256: ' + $hash)
} finally {
  if ($stage -like '*\opencode\premio-release-*') { Remove-Item -LiteralPath $stage -Recurse -Force }
}
