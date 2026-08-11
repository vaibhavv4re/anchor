$filePath = "d:\Projects\Anchor\bundle.js"
$content = [System.IO.File]::ReadAllText($filePath)

$line = 1
$col = 1

$stack = [System.Collections.Generic.Stack[PSObject]]::new()

$inSingleQuote = $false
$inDoubleQuote = $false
$inTemplateString = 0
$templateBraceStack = [System.Collections.Generic.Stack[int]]::new()

$inSingleComment = $false
$inMultiComment = $false

$escape = $false

for ($i = 0; $i -lt $content.Length; $i++) {
    $ch = $content[$i]
    $next = if ($i + 1 -lt $content.Length) { $content[$i + 1] } else { [char]0 }

    if ($ch -eq "`n") {
        $line++
        $col = 1
        if ($inSingleComment) { $inSingleComment = $false }
        continue
    }
    $col++

    if ($inSingleComment) { continue }

    if ($inMultiComment) {
        if ($ch -eq '*' -and $next -eq '/') {
            $inMultiComment = $false
            $i++
            $col++
        }
        continue
    }

    if ($escape) {
        $escape = $false
        continue
    }

    if ($ch -eq '\') {
        if ($inSingleQuote -or $inDoubleQuote -or ($inTemplateString -gt 0)) {
            $escape = $true
        }
        continue
    }

    if ($inSingleQuote) {
        if ($ch -eq "'") { $inSingleQuote = $false }
        continue
    }

    if ($inDoubleQuote) {
        if ($ch -eq '"') { $inDoubleQuote = $false }
        continue
    }

    if ($ch -eq '/' -and $next -eq '/' -and -not $inSingleQuote -and -not $inDoubleQuote -and ($inTemplateString -eq 0)) {
        $inSingleComment = $true
        $i++
        $col++
        continue
    }

    if ($ch -eq '/' -and $next -eq '*' -and -not $inSingleQuote -and -not $inDoubleQuote -and ($inTemplateString -eq 0)) {
        $inMultiComment = $true
        $i++
        $col++
        continue
    }

    if ($ch -eq "'") {
        $inSingleQuote = $true
        continue
    }

    if ($ch -eq '"') {
        $inDoubleQuote = $true
        continue
    }

    if ($ch -eq '`') {
        if ($inTemplateString -gt 0) {
            # Could be ending a template string or starting a nested one
            # For simple template literal tracking:
            $inTemplateString--
        } else {
            $inTemplateString++
        }
        continue
    }

    if ($inTemplateString -gt 0) {
        if ($ch -eq '$' -and $next -eq '{') {
            # Template expression `${`
            $stack.Push([PSCustomObject]@{ Char = '${'; Line = $line; Col = $col })
            $i++
            $col++
            continue
        }
        # While in template string (outside ${}), ignore regular chars
        continue
    }

    # Bracket matching
    if ($ch -eq '{' -or $ch -eq '(' -or $ch -eq '[') {
        $stack.Push([PSCustomObject]@{ Char = [string]$ch; Line = $line; Col = $col })
    }
    elseif ($ch -eq '}' -or $ch -eq ')' -or $ch -eq ']') {
        if ($stack.Count -eq 0) {
            Write-Host "Mismatched closing '$ch' at Line $line, Col $col"
        } else {
            $top = $stack.Pop()
            $expected = switch ($top.Char) {
                '{' { '}' }
                '(' { ')' }
                '[' { ']' }
                '${' { '}' }
            }
            if ($ch -ne $expected) {
                Write-Host "Mismatch! Expected '$expected' for '$($top.Char)' from Line $($top.Line), Col $($top.Col), but found '$ch' at Line $line, Col $col"
            }
        }
    }
}

Write-Host "Parsing completed. Unclosed tokens in stack: $($stack.Count)"
Write-Host "inSingleQuote: $inSingleQuote, inDoubleQuote: $inDoubleQuote, inTemplateString: $inTemplateString"

$count = 0
while ($stack.Count -gt 0 -and $count -lt 20) {
    $item = $stack.Pop()
    Write-Host "Unclosed token '$($item.Char)' opened at Line $($item.Line), Col $($item.Col)"
    $count++
}
