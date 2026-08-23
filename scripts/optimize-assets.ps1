Add-Type -AssemblyName System.Drawing

$sourcePath = Join-Path $PSScriptRoot "..\assets\rebuss.png"
$backupPath = Join-Path $PSScriptRoot "..\assets\rebuss_original.png"

if (-not (Test-Path $backupPath)) {
    Copy-Item $sourcePath $backupPath
}

$origImg = [System.Drawing.Image]::FromFile($backupPath)
# 400x400 gives ultra-crisp display even on 4K/Retina displays
$newWidth = 400
$newHeight = 400

$destRect = New-Object System.Drawing.Rectangle(0, 0, $newWidth, $newHeight)
$destImg = New-Object System.Drawing.Bitmap($newWidth, $newHeight)

$destImg.SetResolution($origImg.HorizontalResolution, $origImg.VerticalResolution)

$graphics = [System.Drawing.Graphics]::FromImage($destImg)
$graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$wrapMode = New-Object System.Drawing.Imaging.ImageAttributes
$wrapMode.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
$graphics.DrawImage($origImg, $destRect, 0, 0, $origImg.Width, $origImg.Height, [System.Drawing.GraphicsUnit]::Pixel, $wrapMode)

$graphics.Dispose()
$origImg.Dispose()

$destImg.Save($sourcePath, [System.Drawing.Imaging.ImageFormat]::Png)
$destImg.Dispose()

$newSize = (Get-Item $sourcePath).Length
Write-Host "Otimização concluída. Novo tamanho: $newSize bytes."
