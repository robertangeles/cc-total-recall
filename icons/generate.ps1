# icons/generate.ps1
# Downscales icons/ico-total-recall.png (the source design, 128x128 or larger)
# to icon128.png, icon48.png, and icon16.png using high-quality bicubic resampling.
#
# Run via the PowerShell tool (or directly if execution policy allows):
#   $sourcePath = "c:\My AI Projects\cc-total-recall\icons\ico-total-recall.png"
#   then paste the body of this script
#
# Update the source PNG, re-run this, and the three sizes refresh.

Add-Type -AssemblyName System.Drawing

$here = Split-Path -Parent $MyInvocation.MyCommand.Definition
if (-not $here) { $here = "." }
$srcPath = Join-Path $here "ico-total-recall.png"

if (-not (Test-Path $srcPath)) {
  Write-Error "Source not found: $srcPath"
  exit 1
}

$src = [System.Drawing.Image]::FromFile($srcPath)

foreach ($size in 16, 48, 128) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
  $g.DrawImage($src, 0, 0, $size, $size)
  $outPath = Join-Path $here "icon$size.png"
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Write-Host "wrote $outPath"
}

$src.Dispose()
