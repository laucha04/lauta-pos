# 🛒 Sistema POS con Autenticación

## Requisitos
- **Node.js v16+** (descargar de https://nodejs.org)
- **npm** (viene con Node.js)

## ⚡ Inicio Rápido

### Opción 1: Windows PowerShell (Recomendado)
```powershell
# Ejecutar el script de inicio
powershell -ExecutionPolicy Bypass -File iniciar.ps1
```

### Opción 2: Terminal / CMD
```bash
npm install    # Solo la primera vez
npm start      # Inicia el servidor
```

El servidor abrirá automáticamente en: **http://localhost:3000**

---

## 👤 Credenciales de Prueba

### Primera vez: Registrarse
1. Haz clic en "Regístrate aquí" en el modal
2. Completa el formulario:
   - **Usuario**: (3-20 caracteres, sin espacios)
   - **Email**: tu@email.com
   - **Contraseña**: Mínimo 8 caracteres
3. Click en "Crear Cuenta"
4. Automáticamente inicia sesión

### Acceso posterior
- Usa el mismo usuario/contraseña que registraste
- Los datos se guardan en la base de datos SQLite (`datos.db`)

---

## 🔄 Flujo de Funcionamiento

### 1. **Autenticación**
   - Modal de login aparece al cargar la página
   - Registro seguro con contraseña hasheada (bcrypt)
   - Token JWT de 7 días

### 2. **Datos Sincronizados**
   - Los datos se guardan en el servidor (por usuario autenticado)
   - Fallback automático a localStorage si no hay conexión
   - Carga automática al iniciar sesión

### 3. **Gestión de Sesión**
   - Tu nombre aparece en la esquina superior derecha
   - Botón "Salir" para cerrar sesión
   - La sesión persiste al recargar la página

---

## 📊 Funcionalidades

### Productos & Stock
- Agregar nuevos productos con precio y stock
- Escanear códigos de barras
- Editar rápidamente precio y cantidad

### Ventas
- Registrar ventas con múltiples productos
- Múltiples métodos de pago:
  - Efectivo
  - Tarjeta (Crédito/Débito)
  - Transferencia
  - Mercado Pago / QR
- Pago dividido entre varios métodos

### Cuentas Corrientes
- Registrar clientes
- Cargar deudas y créditos
- Historial completo de movimientos

### Caja
- Registro de billetes por denominación
- Movimientos diarios
- Totalización automática

### Historial
- Búsqueda por período
- Filtros por tipo de transgresión
- Vista de calendario

---

## 🛠️ Estructura de Carpetas

```
LAUTA/
├── index.html          # Interface principal
├── styles.css          # Estilos integrados
├── codigo.js           # Lógica de la app (3000+ líneas)
├── auth.js             # Sistema de autenticación
├── server.js           # Backend Express + SQLite
├── package.json        # Dependencias
├── datos.db            # Base de datos SQLite (se crea automáticamente)
├── iniciar.ps1         # Script de inicio (Windows)
└── libs/               # Librerías externas (jsPDF, etc)
```

---

## 🔌 API Endpoints

### Autenticación
- `POST /api/auth/register` - Crear cuenta
- `POST /api/auth/login` - Iniciar sesión
- `POST /api/auth/validate` - Validar token
- `POST /api/auth/logout` - Cerrar sesión

### Datos (Protegidos)
- `GET /api/appdata` - Obtener datos del usuario
- `POST /api/appdata` - Guardar datos
- `GET /api/backup` - Descargar backup

### Sistema
- `GET /api/health` - Verificar servidor activo

---

## 🔒 Seguridad

- ✅ Contraseñas hasheadas con bcrypt (10 rounds)
- ✅ Tokens JWT con expiración (7 días)
- ✅ Datos aislados por usuario
- ✅ Middleware de autenticación en todas las rutas protegidas
- ✅ HTTPS recomendado en producción

---

## 🐛 Solución de Problemas

### "Puerto 3000 ya está en uso"
```bash
# Matar proceso en el puerto 3000
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### "Dependencies not installed"
```bash
npm install --save
```

### "Base de datos corrupta"
```bash
# Eliminar y recrear
rm datos.db
npm start
```

### "Error de CORS"
- Asegúrate que accedes desde `http://localhost:3000`
- No desde `127.0.0.1` o IPs diferentes

---

## 📧 Soporte

Para reportar problemas o sugerencias, verifica:
1. Que Node.js esté actualizado: `node --version`
2. Que npm esté actualizado: `npm --version`
3. Que el servidor esté corriendo sin errores
4. Que uses un navegador moderno (Chrome, Firefox, Edge)

---

**¡Sistema listo para usar! 🚀**
