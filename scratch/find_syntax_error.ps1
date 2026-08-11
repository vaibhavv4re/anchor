$code = @'
using System;
using System.Collections.Generic;
using System.IO;

public class JSAnalyzer
{
    public static void Analyze(string filePath)
    {
        string text = File.ReadAllText(filePath);
        int line = 1;
        int col = 1;

        Stack<Token> brackets = new Stack<Token>();
        Stack<ModeInfo> modes = new Stack<ModeInfo>();
        modes.Push(new ModeInfo { Mode = "CODE", Line = 1, Col = 1 });

        for (int i = 0; i < text.Length; i++)
        {
            char c = text[i];
            char next = (i + 1 < text.Length) ? text[i + 1] : '\0';

            if (c == '\n')
            {
                line++;
                col = 1;
                if (modes.Count > 0 && modes.Peek().Mode == "LINE_COMMENT")
                {
                    modes.Pop();
                }
                continue;
            }
            col++;

            ModeInfo currentMode = modes.Peek();

            if (currentMode.Mode == "LINE_COMMENT") continue;

            if (currentMode.Mode == "BLOCK_COMMENT")
            {
                if (c == '*' && next == '/')
                {
                    modes.Pop();
                    i++;
                    col++;
                }
                continue;
            }

            if (currentMode.Mode == "SINGLE_QUOTE")
            {
                if (c == '\\') { i++; col++; continue; }
                if (c == '\'') modes.Pop();
                continue;
            }

            if (currentMode.Mode == "DOUBLE_QUOTE")
            {
                if (c == '\\') { i++; col++; continue; }
                if (c == '"') modes.Pop();
                continue;
            }

            if (currentMode.Mode == "TEMPLATE_TEXT")
            {
                if (c == '\\') { i++; col++; continue; }
                if (c == '`') { modes.Pop(); continue; }
                if (c == '$' && next == '{')
                {
                    modes.Push(new ModeInfo { Mode = "TEMPLATE_EXPR", Line = line, Col = col, BraceDepth = 1 });
                    brackets.Push(new Token { Type = "${", Line = line, Col = col });
                    i++;
                    col++;
                    continue;
                }
                continue;
            }

            // Check comments
            if (c == '/' && next == '/')
            {
                modes.Push(new ModeInfo { Mode = "LINE_COMMENT", Line = line, Col = col });
                i++;
                col++;
                continue;
            }
            if (c == '/' && next == '*')
            {
                modes.Push(new ModeInfo { Mode = "BLOCK_COMMENT", Line = line, Col = col });
                i++;
                col++;
                continue;
            }

            // Check strings
            if (c == '\'')
            {
                modes.Push(new ModeInfo { Mode = "SINGLE_QUOTE", Line = line, Col = col });
                continue;
            }
            if (c == '"')
            {
                modes.Push(new ModeInfo { Mode = "DOUBLE_QUOTE", Line = line, Col = col });
                continue;
            }
            if (c == '`')
            {
                modes.Push(new ModeInfo { Mode = "TEMPLATE_TEXT", Line = line, Col = col });
                continue;
            }

            // Check regex / pattern /
            if (c == '/')
            {
                int p = i - 1;
                while (p >= 0 && (text[p] == ' ' || text[p] == '\t' || text[p] == '\r' || text[p] == '\n')) p--;
                if (p >= 0)
                {
                    char prev = text[p];
                    if (prev == '(' || prev == ',' || prev == '=' || prev == ':' || prev == '[' ||
                        prev == '!' || prev == '&' || prev == '|' || prev == '?' || prev == '{' ||
                        prev == ';' || prev == '+' || prev == '-' || prev == '*' || prev == '%' ||
                        prev == '<' || prev == '>' || prev == '^' || prev == '~')
                    {
                        i++; col++;
                        bool inClass = false;
                        while (i < text.Length)
                        {
                            char rc = text[i];
                            if (rc == '\n') break;
                            if (rc == '\\') { i++; col++; }
                            else if (rc == '[') inClass = true;
                            else if (rc == ']') inClass = false;
                            else if (rc == '/' && !inClass) break;
                            i++; col++;
                        }
                        continue;
                    }
                }
            }

            // Brackets
            if (c == '(' || c == '[')
            {
                brackets.Push(new Token { Type = c.ToString(), Line = line, Col = col });
            }
            else if (c == '{')
            {
                if (currentMode.Mode == "TEMPLATE_EXPR")
                {
                    currentMode.BraceDepth++;
                }
                brackets.Push(new Token { Type = "{", Line = line, Col = col });
            }
            else if (c == ')' || c == ']')
            {
                if (brackets.Count == 0)
                {
                    Console.WriteLine("EMPTY STACK: Closing " + c + " at Line " + line + ", Col " + col);
                    return;
                }
                else
                {
                    Token top = brackets.Pop();
                    string expected = (top.Type == "(") ? ")" : "]";
                    if (c.ToString() != expected)
                    {
                        Console.WriteLine("MISMATCH: Expected " + expected + " for " + top.Type + " from Line " + top.Line + ", Col " + top.Col + " but got " + c + " at Line " + line + ", Col " + col);
                        return;
                    }
                }
            }
            else if (c == '}')
            {
                if (brackets.Count == 0)
                {
                    Console.WriteLine("EMPTY STACK: Closing } at Line " + line + ", Col " + col);
                    return;
                }
                else
                {
                    Token top = brackets.Pop();
                    string expected = (top.Type == "{") ? "}" : "}";
                    if (top.Type != "{" && top.Type != "${")
                    {
                        Console.WriteLine("MISMATCH: Expected } for " + top.Type + " from Line " + top.Line + ", Col " + top.Col + " but got } at Line " + line + ", Col " + col);
                        return;
                    }
                }

                if (currentMode.Mode == "TEMPLATE_EXPR")
                {
                    currentMode.BraceDepth--;
                    if (currentMode.BraceDepth == 0)
                    {
                        modes.Pop();
                    }
                }
            }
        }

        Console.WriteLine("=== Parsing Completed Successfully! Stack size = " + brackets.Count + " ===");
        if (brackets.Count > 0)
        {
            Console.WriteLine("Unclosed brackets:");
            while (brackets.Count > 0)
            {
                Token b = brackets.Pop();
                Console.WriteLine("  Unclosed " + b.Type + " from Line " + b.Line + ", Col " + b.Col);
            }
        }
        if (modes.Count > 1)
        {
            Console.WriteLine("Unclosed modes:");
            while (modes.Count > 0)
            {
                ModeInfo m = modes.Pop();
                Console.WriteLine("  Mode " + m.Mode + " from Line " + m.Line + ", Col " + m.Col);
            }
        }
    }
}

public class ModeInfo
{
    public string Mode;
    public int Line;
    public int Col;
    public int BraceDepth;
}

public class Token
{
    public string Type;
    public int Line;
    public int Col;
}
'@

Add-Type -TypeDefinition $code -Language CSharp
[JSAnalyzer]::Analyze("d:\Projects\Anchor\bundle.js")
