# Script de inicio del servidor POS con autenticación

Write-Host "╔════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Sistema POS - Iniciando aplicación       ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Obtener directorio actual
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# Verificar si npm está instalado
Write-Host "✓ Verificando Node.js..." -ForegroundColor Yellow
$nodeCheck = npm --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Node.js no está instalado. Por favor instala Node.js desde: https://nodejs.org" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Node.js encontrado: $(node --version)" -ForegroundColor Green
Write-Host "✓ npm encontrado: $(npm --version)" -ForegroundColor Green
Write-Host ""

# Verificar si node_modules existe
Write-Host "✓ Verificando dependencias..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "  Instalando dependencias (esto puede tomar un minuto)..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ Error instalando dependencias" -ForegroundColor Red
        exit 1
    }
}
Write-Host "✓ Dependencias listas" -ForegroundColor Green
Write-Host ""

# Verificar si el servidor ya está corriendo
Write-Host "✓ Verificando disponibilidad del puerto..." -ForegroundColor Yellow
$portCheck = Test-NetConnection -ComputerName localhost -Port 3000 -WarningAction SilentlyContinue
if ($portCheck.TcpTestSucceeded) {
    Write-Host "⚠ El puerto 3000 ya está en uso" -ForegroundColor Yellow
    Write-Host "¿Deseas continuar con otro puerto? (S/N)" -ForegroundColor Yellow
    $response = Read-Host
    if ($response -ne "S" -and $response -ne "s") {
        exit 1
    }
}

# Iniciar servidor
Write-Host ""
Write-Host "╔════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  Iniciando servidor...                    ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# Agregar timeout y luego abrir navegador
$url = "http://localhost:3000"
Write-Host "Servidor accesible en: $url" -ForegroundColor Cyan
Write-Host ""
Write-Host "Consolas activas:" -ForegroundColor Yellow
Write-Host "  • npm start  (anterior)" -ForegroundColor Gray
Write-Host "  • PowerShell (actual)" -ForegroundColor Gray
Write-Host ""
Write-Host "Para detener: Presiona Ctrl+C en ambas ventanas" -ForegroundColor Yellow
Write-Host ""

# Esperar un poco e intentar abrir el navegador
Start-Sleep -Seconds 2
try {
    Start-Process $url -ErrorAction SilentlyContinue
    Write-Host "✓ Navegador abierto" -ForegroundColor Green
} catch {
    Write-Host "✓ Abre manualmente: $url" -ForegroundColor Cyan
}

# Ejecutar servidor
Write-Host ""
node server.js
