$filePath = "d:\Projects\Anchor\bundle.js"
$jsCode = [System.IO.File]::ReadAllText($filePath)

$doc = New-Object -ComObject HTMLFile
$doc.write("<html><head><script>`n$jsCode`n</script></head><body></body></html>")

if ($doc.Script -and $doc.Script.Error) {
    Write-Host "Script Error: $($doc.Script.Error)"
} else {
    Write-Host "MSHTML doc created. Checking errors..."
}
