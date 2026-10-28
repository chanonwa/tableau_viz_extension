$ErrorActionPreference = 'Stop'

$root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$rootPrefix = $root.TrimEnd('\') + '\'
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add('http://localhost:8765/')
$listener.Start()

Write-Host 'Serving this extension at http://localhost:8765/'
Write-Host 'Press Ctrl+C to stop the server.'

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $relativePath = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))
        if ([string]::IsNullOrWhiteSpace($relativePath)) {
            $relativePath = 'index.html'
        }

        $filePath = [System.IO.Path]::GetFullPath((Join-Path $root $relativePath))
        if (-not $filePath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
            -not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
            $context.Response.StatusCode = 404
            $context.Response.Close()
            continue
        }

        $contentType = switch ([System.IO.Path]::GetExtension($filePath).ToLowerInvariant()) {
            '.html' { 'text/html; charset=utf-8' }
            '.js' { 'text/javascript; charset=utf-8' }
            '.css' { 'text/css; charset=utf-8' }
            '.trex' { 'application/xml; charset=utf-8' }
            default { 'application/octet-stream' }
        }

        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $context.Response.ContentType = $contentType
        # Tableau's embedded browser caches aggressively; always serve the latest files while developing
        $context.Response.Headers.Add('Cache-Control', 'no-store')
        $context.Response.ContentLength64 = $bytes.Length
        $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        $context.Response.Close()
    }
}
finally {
    $listener.Stop()
    $listener.Close()
}
