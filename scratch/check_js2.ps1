$filePath = "d:\Projects\Anchor\bundle.js"
$code = [System.IO.File]::ReadAllText($filePath)

$line = 1
$col = 1

$stack = [System.Collections.Generic.Stack[PSObject]]::new()
# Mode stack can contain objects with properties: Mode, Line, Col, BraceDepth

$modeStack = [System.Collections.Generic.Stack[PSObject]]::new()
$modeStack.Push([PSCustomObject]@{ Mode = 'CODE'; Line = 1; Col = 1; BraceDepth = 0 })

$i = 0
$len = $code.Length

while ($i -lt $len) {
    $c = $code[$i]
    $next = if ($i + 1 -lt $len) { $code[$i + 1] } else { [char]0 }

    if ($c -eq "`n") {
        $line++
        $col = 1
        $currentMode = $modeStack.Peek().Mode
        if ($currentMode -eq 'LINE_COMMENT') {
            $modeStack.Pop() | Out-Null
        }
        $i++
        continue
    }
    $col++

    $current = $modeStack.Peek()

    if ($current.Mode -eq 'LINE_COMMENT') {
        $i++
        continue
    }

    if ($current.Mode -eq 'BLOCK_COMMENT') {
        if ($c -eq '*' -and $next -eq '/') {
            $modeStack.Pop() | Out-Null
            $i += 2
            $col++
            continue
        }
        $i++
        continue
    }

    if ($current.Mode -eq 'SINGLE_QUOTE') {
        if ($c -eq '\') {
            $i += 2
            $col++
            continue
        }
        if ($c -eq "'") {
            $modeStack.Pop() | Out-Null
        }
        $i++
        continue
    }

    if ($current.Mode -eq 'DOUBLE_QUOTE') {
        if ($c -eq '\') {
            $i += 2
            $col++
            continue
        }
        if ($c -eq '"') {
            $modeStack.Pop() | Out-Null
        }
        $i++
        continue
    }

    if ($current.Mode -eq 'TEMPLATE_TEXT') {
        if ($c -eq '\') {
            $i += 2
            $col++
            continue
        }
        if ($c -eq '`') {
            $modeStack.Pop() | Out-Null
            $i++
            continue
        }
        if ($c -eq '$' -and $next -eq '{') {
            $modeStack.Push([PSCustomObject]@{ Mode = 'TEMPLATE_EXPR'; Line = $line; Col = $col; BraceDepth = 1 })
            $i += 2
            $col++
            continue
        }
        $i++
        continue
    }

    # If we are in CODE or TEMPLATE_EXPR mode:
    # Check for comments
    if ($c -eq '/' -and $next -eq '/') {
        $modeStack.Push([PSCustomObject]@{ Mode = 'LINE_COMMENT'; Line = $line; Col = $col })
        $i += 2
        $col++
        continue
    }
    if ($c -eq '/' -and $next -eq '*') {
        $modeStack.Push([PSCustomObject]@{ Mode = 'BLOCK_COMMENT'; Line = $line; Col = $col })
        $i += 2
        $col++
        continue
    }

    # Check for strings
    if ($c -eq "'") {
        $modeStack.Push([PSCustomObject]@{ Mode = 'SINGLE_QUOTE'; Line = $line; Col = $col })
        $i++
        continue
    }
    if ($c -eq '"') {
        $modeStack.Push([PSCustomObject]@{ Mode = 'DOUBLE_QUOTE'; Line = $line; Col = $col })
        $i++
        continue
    }
    if ($c -eq '`') {
        $modeStack.Push([PSCustomObject]@{ Mode = 'TEMPLATE_TEXT'; Line = $line; Col = $col })
        $i++
        continue
    }

    # Check brackets
    if ($c -eq '(' -or $c -eq '[') {
        $stack.Push([PSCustomObject]@{ Char = [string]$c; Line = $line; Col = $col })
    }
    elseif ($c -eq '{') {
        if ($current.Mode -eq 'TEMPLATE_EXPR') {
            $current.BraceDepth++
        }
        $stack.Push([PSCustomObject]@{ Char = '{'; Line = $line; Col = $col })
    }
    elseif ($c -eq ')' -or $c -eq ']') {
        if ($stack.Count -eq 0) {
            Write-Host "ERROR: Unexpected closing '$c' at Line $line, Col $col"
        } else {
            $top = $stack.Pop()
            $expected = if ($top.Char -eq '(') { ')' } else { ']' }
            if ($c -ne $expected) {
                Write-Host "ERROR: Mismatch! Expected '$expected' for '$($top.Char)' from Line $($top.Line), Col $($top.Col), but found '$c' at Line $line, Col $col"
            }
        }
    }
    elseif ($c -eq '}') {
        if ($stack.Count -eq 0) {
            Write-Host "ERROR: Unexpected closing '}' at Line $line, Col $col"
        } else {
            $top = $stack.Pop()
            if ($top.Char -ne '{') {
                Write-Host "ERROR: Mismatch! Expected '}' for '$($top.Char)' from Line $($top.Line), Col $($top.Col), but found '}' at Line $line, Col $col"
            }
        }
        if ($current.Mode -eq 'TEMPLATE_EXPR') {
            $current.BraceDepth--
            if ($current.BraceDepth -eq 0) {
                $modeStack.Pop() | Out-Null
            }
        }
    }

    $i++
}

Write-Host "=== Analysis Complete ==="
Write-Host "Remaining modes in stack:"
foreach ($m in $modeStack) {
    Write-Host " Mode: $($m.Mode) opened at Line $($m.Line), Col $($m.Col)"
}
Write-Host "Remaining brackets in stack: $($stack.Count)"
$cCount = 0
while ($stack.Count -gt 0 -and $cCount -lt 20) {
    $item = $stack.Pop()
    Write-Host " Unclosed '$($item.Char)' opened at Line $($item.Line), Col $($item.Col)"
    $cCount++
}
