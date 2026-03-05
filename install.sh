#!/bin/bash
# Script para instalar y ejecutar el POS

echo "=== Sistema de Punto de Venta (POS) - Instalación ==="
echo ""

# Instalar dependencias
echo "1. Instalando dependencias..."
npm install

echo ""
echo "2. Iniciando servidor..."
echo ""
echo "✓ Servidor iniciado en http://localhost:3000"
echo ""
echo "Acciones:"
echo "  • Abre http://localhost:3000 en tu navegador"
echo "  • Crea una cuenta nueva o inicia sesión"
echo "  • ¡Comienza a usar el sistema POS!"
echo ""
echo "Para detener el servidor, presiona Ctrl+C"
echo ""

npm start
