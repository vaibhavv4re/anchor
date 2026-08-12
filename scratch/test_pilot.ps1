# PowerShell Pilot Verification Test for K-03
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "🧪 Running K-03 Pilot Verification Test..." -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# 1. Read bundle.js and check structure
$bundleText = Get-Content -Path 'bundle.js' -Raw
$hasRecipeModel = $bundleText.Contains('class RecipeModel')
$hasKitchenRecipeView = $bundleText.Contains('class KitchenRecipeView')
$hasSchemaRecipes = (Get-Content -Path 'supabase_schema.sql' -Raw).Contains('CREATE TABLE IF NOT EXISTS recipes')

Write-Host "1. RecipeModel Class in bundle.js: $hasRecipeModel" -ForegroundColor Green
Write-Host "2. KitchenRecipeView Class in bundle.js: $hasKitchenRecipeView" -ForegroundColor Green
Write-Host "3. Recipes Table DDL in supabase_schema.sql: $hasSchemaRecipes" -ForegroundColor Green

if ($hasRecipeModel -and $hasKitchenRecipeView -and $hasSchemaRecipes) {
  Write-Host "=============================================" -ForegroundColor Green
  Write-Host "🎉 ALL K-03 Pilot Components Successfully Verified!" -ForegroundColor Green
  Write-Host "=============================================" -ForegroundColor Green
} else {
  Write-Host "❌ Verification Failed!" -ForegroundColor Red
}
