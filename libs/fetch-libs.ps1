# Descarga jsPDF y jsPDF-AutoTable en ./libs/
# Uso: Ejecutar desde la raíz del proyecto en PowerShell:
#   .\libs\fetch-libs.ps1

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$files = @{
  "jspdf.umd.min.js" = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
  "jspdf.plugin.autotable.min.js" = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js";
}

if (-not (Test-Path -Path "./libs")) { New-Item -ItemType Directory -Path "./libs" | Out-Null }

foreach ($name in $files.Keys) {
  $url = $files[$name]
  Write-Host "Descargando $name desde $url ..."
  try {
    Invoke-WebRequest -Uri $url -OutFile (Join-Path -Path "./libs" -ChildPath $name) -UseBasicParsing -ErrorAction Stop
    Write-Host "OK: $name"
  } catch {
    $msg = $_ | Out-String
    Write-Host ("ERROR descargando {0}: {1}" -f $name, $msg.Trim()) -ForegroundColor Red
  }
}

Write-Host "Descarga completada. Verifica que los archivos existan en ./libs/"