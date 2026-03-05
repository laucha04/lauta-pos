Coloca aquí copias locales de las librerías jsPDF y jsPDF-AutoTable para que la aplicación las cargue sin depender del CDN.

Archivos esperados:
- jspdf.umd.min.js  (ej. https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js)
- jspdf.plugin.autotable.min.js (ej. https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js)

También puedes ejecutar el script `fetch-libs.ps1` para descargar las versiones recomendadas automáticamente:

  powershell -ExecutionPolicy Bypass -File .\libs\fetch-libs.ps1

Si tu hosting/entorno bloquea accesos a CDN por CSP o red, colocar estos archivos evitará caídas en la generación de PDF.