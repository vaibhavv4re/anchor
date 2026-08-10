$docxPath = "D:\Projects\Anchor\Menu PS version.docx"
$zipPath = "D:\Projects\Anchor\scratch\temp_menu.zip"
$tempDir = "D:\Projects\Anchor\scratch\temp_docx"

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }

Copy-Item -Path $docxPath -Destination $zipPath
Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force

$xmlFile = "$tempDir\word\document.xml"
[xml]$xml = Get-Content $xmlFile -Raw

$nsManager = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
$nsManager.AddNamespace("w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main")

$paragraphs = $xml.SelectNodes("//w:p", $nsManager)
$outputLines = @()

foreach ($p in $paragraphs) {
    $tNodes = $p.SelectNodes(".//w:t", $nsManager)
    $pText = ""
    foreach ($t in $tNodes) {
        $pText += $t.InnerText
    }
    if ($pText.Trim().Length -gt 0) {
        $outputLines += $pText.Trim()
    }
}

$outputLines | Out-File -FilePath "D:\Projects\Anchor\extracted_menu_text.txt" -Encoding utf8
Write-Host "Success! Extracted" $outputLines.Count "lines."

Remove-Item $zipPath -Force
Remove-Item $tempDir -Recurse -Force
