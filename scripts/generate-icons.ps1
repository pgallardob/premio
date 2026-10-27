$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$output = Join-Path $root 'assets\images\app'
[System.IO.Directory]::CreateDirectory($output) | Out-Null
$source = [System.Drawing.Image]::FromFile((Join-Path $root 'img\logoolivos.jpeg'))
try {
  $targets = @(@('icon-192.png', 192, 0.88), @('icon-512.png', 512, 0.88), @('maskable-512.png', 512, 0.62), @('apple-touch-icon.png', 180, 0.88))
  foreach ($target in $targets) {
    $size = [int]$target[1]
    $bitmap = [System.Drawing.Bitmap]::new($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#f3f4e9'))
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
      $width = [single]($size * [double]$target[2])
      $height = [single]($width * 0.64)
      $destination = [System.Drawing.RectangleF]::new([single](($size - $width) / 2), [single](($size - $height) / 2), $width, $height)
      $crop = [System.Drawing.RectangleF]::new(220, 180, 1000, 640)
      $graphics.DrawImage($source, $destination, $crop, [System.Drawing.GraphicsUnit]::Pixel)
      $bitmap.Save((Join-Path $output $target[0]), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
  }
} finally { $source.Dispose() }
Write-Output 'Generated local app icons from the original logo.'
