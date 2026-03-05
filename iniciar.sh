#!/bin/bash
# Script para iniciar la aplicación en Linux/Mac o Git Bash en Windows

echo "╔════════════════════════════════════════════╗"
echo "║  Sistema POS - Iniciando aplicación       ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# Verificar Node.js
echo "✓ Verificando Node.js..."
node_version=$(node --version)
npm_version=$(npm --version)

if [[ -z "$node_version" ]]; then
    echo "✗ Node.js no está instalado"
    exit 1
fi

echo "✓ Node.js encontrado: $node_version"
echo "✓ npm encontrado: $npm_version"
echo ""

# Instalar dependencias si es necesario
echo "✓ Verificando dependencias..."
if [[ ! -d "node_modules" ]]; then
    echo "  Instalando dependencias (esto puede tomar un minuto)..."
    npm install
fi
echo "✓ Dependencias listas"
echo ""

# Iniciar servidor
echo "╔════════════════════════════════════════════╗"
echo "║  Iniciando servidor...                    ║"
echo "╚════════════════════════════════════════════╝"
echo ""
echo "Servidor accesible en: http://localhost:3000"
echo ""

npm start
