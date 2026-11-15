#!/usr/bin/env bash
# Compila el lanzador para Windows, macOS y Linux con la aplicación dentro.
# Requisitos: Go 1.22 o superior. Uso:  ./lanzador/compilar.sh
set -euo pipefail

cd "$(dirname "$0")"
RAIZ=".."
VERSION="$(date +%Y.%m.%d)"

# Copia la aplicación dentro del lanzador para incrustarla en el ejecutable.
rm -rf app
mkdir -p app
cp -r "$RAIZ/index.html" "$RAIZ/auth-microsoft.html" "$RAIZ/css" "$RAIZ/js" "$RAIZ/vendor" app/

mkdir -p "$RAIZ/dist"
compilar() { # GOOS GOARCH nombre
  echo "→ $3"
  CGO_ENABLED=0 GOOS="$1" GOARCH="$2" go build -trimpath -ldflags "-s -w -X main.version=$VERSION" -o "$RAIZ/dist/$3" .
}
compilar windows amd64 facturas-windows.exe
compilar darwin  arm64 facturas-mac-apple
compilar darwin  amd64 facturas-mac-intel
compilar linux   amd64 facturas-linux

rm -rf app
echo "Listo: ejecutables en dist/"
