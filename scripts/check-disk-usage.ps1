# Script for å sjekke diskplass brukt av prosjektet
Write-Host "=== DROPSHIPPING PROSJEKT DISKPLASS ===" -ForegroundColor Green
Write-Host ""

$basePath = "C:\Users\robto\OneDrive\Skrivebord\Dropshipping"
$folders = @('dropshipping-v1', 'dropshipping-v2', 'dropshipping-upgrade', 'dropshipping-new', 'backup dropshipping-v1')

$totalSize = 0

foreach ($folder in $folders) {
    $fullPath = Join-Path $basePath $folder
    if (Test-Path $fullPath) {
        Write-Host "Sjekker $folder..." -ForegroundColor Yellow
        
        # Sjekk node_modules
        $nodeModulesPath = Join-Path $fullPath "node_modules"
        $nodeModulesSize = 0
        if (Test-Path $nodeModulesPath) {
            $nodeModulesSize = (Get-ChildItem -Path $nodeModulesPath -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB
        }
        
        # Sjekk .next
        $nextPath = Join-Path $fullPath ".next"
        $nextSize = 0
        if (Test-Path $nextPath) {
            $nextSize = (Get-ChildItem -Path $nextPath -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB
        }
        
        # Sjekk total størrelse
        $folderSize = (Get-ChildItem -Path $fullPath -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB
        
        Write-Host "  Total: $([math]::Round($folderSize, 2)) MB" -ForegroundColor Cyan
        if ($nodeModulesSize -gt 0) {
            Write-Host "    node_modules: $([math]::Round($nodeModulesSize, 2)) MB" -ForegroundColor Red
        }
        if ($nextSize -gt 0) {
            Write-Host "    .next: $([math]::Round($nextSize, 2)) MB" -ForegroundColor Yellow
        }
        Write-Host ""
        
        $totalSize += $folderSize
    }
}

Write-Host "=== TOTAL STØRRELSE ===" -ForegroundColor Green
Write-Host "Total prosjekt størrelse: $([math]::Round($totalSize, 2)) MB ($([math]::Round($totalSize / 1024, 2)) GB)" -ForegroundColor Cyan
Write-Host ""

Write-Host "=== TIPS FOR Å SPARE PLASS ===" -ForegroundColor Green
Write-Host "1. Slett gamle prosjekter du ikke bruker lenger (v1, v2, backup, new)"
Write-Host "2. Slett node_modules og kjør npm install når du trenger dem"
Write-Host "3. Slett .next mapper (bygges automatisk ved npm run build/dev)"
Write-Host "4. Sjekk om du har .git mapper som tar mye plass"
Write-Host "5. Bare behold dropshipping-upgrade hvis det er aktivt prosjekt"

