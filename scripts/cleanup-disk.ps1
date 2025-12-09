# Script for å rydde opp og spare diskplass
Write-Host "=== DROPSHIPPING CLEANUP SCRIPT ===" -ForegroundColor Green
Write-Host ""

$basePath = "C:\Users\robto\OneDrive\Skrivebord\Dropshipping"

# Funksjon for å sjekke størrelse
function Get-FolderSize {
    param($Path)
    if (Test-Path $Path) {
        return (Get-ChildItem -Path $Path -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB
    }
    return 0
}

# Funksjon for å slette mappe
function Remove-LargeFolder {
    param($Path, $Name)
    if (Test-Path $Path) {
        $size = Get-FolderSize -Path $Path
        Write-Host "Sletter $Name ($([math]::Round($size, 2)) MB)..." -ForegroundColor Yellow
        Remove-Item -Path $Path -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "✓ Slettet $Name" -ForegroundColor Green
        return $size
    }
    return 0
}

$savedSpace = 0

Write-Host "=== CLEANUP VALG ===" -ForegroundColor Cyan
Write-Host "1. Slett .next mapper (bygges automatisk)"
Write-Host "2. Slett node_modules i dropshipping-v2 (gamle prosjekt)"
Write-Host "3. Slett hele dropshipping-v2 (anbefalt hvis du ikke bruker det)"
Write-Host "4. Slett hele dropshipping-v1 (gammelt prosjekt)"
Write-Host "5. Slett hele 'backup dropshipping-v1'"
Write-Host "6. Slett hele 'dropshipping-new'"
Write-Host "7. Slett .next i dropshipping-upgrade (bygges på nytt ved npm run dev)"
Write-Host ""

# Foreslå cleanups
Write-Host "=== FORESLÅTTE CLEANUPS ===" -ForegroundColor Green

# 1. Slett .next i alle prosjekter
Write-Host "1. Sletter .next mapper..."
foreach ($folder in @('dropshipping-v1', 'dropshipping-v2', 'dropshipping-upgrade')) {
    $nextPath = Join-Path $basePath "$folder\.next"
    $size = Get-FolderSize -Path $nextPath
    if ($size -gt 0) {
        $savedSpace += Remove-LargeFolder -Path $nextPath -Name "$folder\.next"
    }
}

# 2. Slett node_modules i dropshipping-v2 (hvis den eksisterer)
$v2NodeModules = Join-Path $basePath "dropshipping-v2\node_modules"
$v2Size = Get-FolderSize -Path $v2NodeModules
if ($v2Size -gt 0) {
    Write-Host ""
    Write-Host "2. Fant node_modules i dropshipping-v2 ($([math]::Round($v2Size, 2)) MB)" -ForegroundColor Yellow
    $response = Read-Host "Slette? (j/n)"
    if ($response -eq "j" -or $response -eq "J") {
        $savedSpace += Remove-LargeFolder -Path $v2NodeModules -Name "dropshipping-v2\node_modules"
    }
}

# 3. Foreslå å slette gamle prosjekter
Write-Host ""
Write-Host "=== GAMLE PROSJEKTER ===" -ForegroundColor Yellow
Write-Host "Du har flere gamle prosjekter som tar opp plass:"
Write-Host "- dropshipping-v1 (kan slettes hvis du ikke bruker det)"
Write-Host "- dropshipping-v2 (kan slettes hvis du ikke bruker det - $([math]::Round((Get-FolderSize -Path (Join-Path $basePath "dropshipping-v2")), 2)) MB)"
Write-Host "- backup dropshipping-v1 (kan slettes hvis du ikke trenger backup)"
Write-Host "- dropshipping-new (kan slettes hvis du ikke bruker det)"
Write-Host ""

Write-Host "=== TOTAL SPART PLASS ===" -ForegroundColor Green
Write-Host "Spart så langt: $([math]::Round($savedSpace, 2)) MB ($([math]::Round($savedSpace / 1024, 2)) GB)" -ForegroundColor Cyan
Write-Host ""
Write-Host "Tips: Du kan kjøre 'npm install' i dropshipping-upgrade etter cleanup hvis du trenger node_modules" -ForegroundColor Yellow

