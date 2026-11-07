# Render the repository's vector icon to installation PNGs without external packages.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$iconRoot = (Resolve-Path (Join-Path $PSScriptRoot '../web/icons')).Path
[xml]$svg = Get-Content -LiteralPath (Join-Path $iconRoot 'wen.svg') -Raw

function Convert-IconPath([string]$data) {
    $tokens = [regex]::Matches($data, '[MLCZ]|-?\d+(?:\.\d+)?')
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $cursorX = 0.0; $cursorY = 0.0; $index = 0
    while ($index -lt $tokens.Count) {
        $command = $tokens[$index++].Value
        switch ($command) {
            'M' {
                $path.StartFigure()
                $cursorX = [float]$tokens[$index++].Value
                $cursorY = [float]$tokens[$index++].Value
            }
            'L' {
                $nextX = [float]$tokens[$index++].Value
                $nextY = [float]$tokens[$index++].Value
                $path.AddLine($cursorX, $cursorY, $nextX, $nextY)
                $cursorX = $nextX; $cursorY = $nextY
            }
            'C' {
                $values = for ($n = 0; $n -lt 6; $n++) { [float]$tokens[$index++].Value }
                $path.AddBezier($cursorX, $cursorY, $values[0], $values[1], $values[2], $values[3], $values[4], $values[5])
                $cursorX = $values[4]; $cursorY = $values[5]
            }
            'Z' { $path.CloseFigure() }
            default { throw "Unsupported SVG path command: $command" }
        }
    }
    return ,$path
}

foreach ($size in @(180, 192, 512)) {
    # Supersampling keeps the small Apple icon and thin orbit smooth.
    $canvas = [System.Drawing.Bitmap]::new(1536, 1536)
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    $graphics.SmoothingMode = 'AntiAlias'
    $graphics.ScaleTransform(3, 3)
    $gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        [System.Drawing.Point]::new(0, 0), [System.Drawing.Point]::new(512, 512),
        [System.Drawing.ColorTranslator]::FromHtml('#f2faff'),
        [System.Drawing.ColorTranslator]::FromHtml('#d3e9f2'))
    # Opaque background fills the OS mask on iOS, Android and Windows.
    $graphics.FillRectangle($gradient, 0, 0, 512, 512)
    $gradient.Dispose()
    foreach ($element in $svg.SelectNodes('//*[local-name()="path" or local-name()="circle" or local-name()="rect"]')) {
        if ($element.fill -eq 'url(#porcelain)') { continue }
        $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
        if ($element.LocalName -eq 'path') {
            $path.Dispose(); $path = Convert-IconPath $element.d
        } elseif ($element.LocalName -eq 'circle') {
            $radius = [float]$element.r
            $path.AddEllipse(([float]$element.cx - $radius), ([float]$element.cy - $radius), (2 * $radius), (2 * $radius))
        } else {
            $x = [float]$element.x; $y = [float]$element.y
            $w = [float]$element.width; $h = [float]$element.height; $r = [float]$element.rx
            $path.AddArc($x, $y, (2*$r), (2*$r), 180, 90)
            $path.AddArc(($x+$w-2*$r), $y, (2*$r), (2*$r), 270, 90)
            $path.AddArc(($x+$w-2*$r), ($y+$h-2*$r), (2*$r), (2*$r), 0, 90)
            $path.AddArc($x, ($y+$h-2*$r), (2*$r), (2*$r), 90, 90)
            $path.CloseFigure()
        }
        $fill = $element.GetAttribute('fill')
        if (!$fill -and $element.ParentNode.LocalName -eq 'g') { $fill = $element.ParentNode.GetAttribute('fill') }
        if ($fill -and $fill -ne 'none') {
            $brush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($fill))
            $graphics.FillPath($brush, $path); $brush.Dispose()
        }
        if ($element.stroke) {
            $pen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml($element.stroke), [float]$element.GetAttribute('stroke-width'))
            $pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
            $graphics.DrawPath($pen, $path); $pen.Dispose()
        }
        $path.Dispose()
    }
    $graphics.Dispose()
    $output = [System.Drawing.Bitmap]::new($size, $size)
    $resize = [System.Drawing.Graphics]::FromImage($output)
    $resize.InterpolationMode = 'HighQualityBicubic'
    $resize.DrawImage($canvas, 0, 0, $size, $size)
    $name = if ($size -eq 180) { 'wen-touch.png' } else { "wen-$size.png" }
    $output.Save((Join-Path $iconRoot $name), [System.Drawing.Imaging.ImageFormat]::Png)
    $resize.Dispose(); $output.Dispose(); $canvas.Dispose()
    Write-Output "Rendered $name"
}
