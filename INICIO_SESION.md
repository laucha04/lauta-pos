$ Sistema POS - Inicio Rápido

═══════════════════════════════════════════════════════════
  ✅ VERIFICACIÓN RÁPIDA DEL SISTEMA
═══════════════════════════════════════════════════════════

## 🚀 PASO 1: INICIAR EL SERVIDOR

### Windows (Recomendado):
```powershell
powershell -ExecutionPolicy Bypass -File iniciar.ps1
```

### Linux/Mac/Git Bash:
```bash
bash iniciar.sh
```

### Manual (Cualquier OS):
```bash
npm install    # Primera vez
npm start      # Inicia servidor
```

### Resultado esperado:
```
✓ Node.js encontrado: v18.x.x
✓ npm encontrado: 10.x.x  
✓ Dependencias listas
✓ Servidor iniciado en http://localhost:3000
✓ Sistema de autenticación activado
```

─────────────────────────────────────────────────────────

## 🌐 PASO 2: ABRIR EN NAVEGADOR

Accede a: **http://localhost:3000**

### Lo que ves:
- ✅ Modal de login/registro (VISIBLE)
- ✅ Background gradiente (integrado)
- ✅ Campos de usuario y contraseña
- ✅ Botón para crear cuenta
- ✅ TODO EL CONTENIDO PRINCIPAL OCULTO

─────────────────────────────────────────────────────────

## 📝 PASO 3: REGISTRARSE

1. Click en "Regístrate aquí"
2. Completa el formulario:
   ```
   Usuario: miusuario (sin espacios)
   Email: mi@email.com
   Contraseña: password123 (8+ caracteres)
   Repetir: password123
   ```
3. Click en "Crear Cuenta"
4. Toast: "¡Bienvenido miusuario!"

### Resultado:
- ✅ Modal desaparece
- ✅ Ves toda la aplicación
- ✅ Tu usuario en esquina superior derecha
- ✅ Botón "Salir" visible

─────────────────────────────────────────────────────────

## 🔄 PASO 4: RECARGAR (F5)

Presiona F5 en el navegador

### Resultado:
- ✅ Modal NO aparece
- ✅ Aplicación carga automáticamente
- ✅ Tu usuario sigue visible
- ✅ Todos los datos persisten
- ✅ SIN necesidad de volver a login

─────────────────────────────────────────────────────────

## 🚪 PASO 5: LOGOUT

1. Click en "Salir" (esquina superior derecha)
2. Confirma: "¿Estás seguro?"
3. SÍ

### Resultado:
- ✅ Modal de login reaparece
- ✅ Contenido principal desaparece
- ✅ Todos los datos se limpian

─────────────────────────────────────────────────────────

## 🔐 PASO 6: INICIAR SESIÓN NUEVAMENTE

1. Usuario: `miusuario`
2. Contraseña: `password123`
3. Click en "Iniciar Sesión"

### Resultado:
- ✅ TUS MISMOS DATOS REAPARECEN
- ✅ Sesión restaurada
- ✅ Continuidad total

═════════════════════════════════════════════════════════

## 🎨 ESTRUCTURA VISUAL

### ANTES DEL LOGIN (Primera Carga)
```
┌─────────────────────────────────────────┐
│                                         │
│   ┌─────────────────────────────────┐   │
│   │  📋 Gestión de Ventas           │   │ MODAL
│   │  Sistema de Punto de Venta      │   │ VISIBLE
│   │                                 │   │
│   │  ○ Inicia Sesión                │   │
│   │    [Usuario]                    │   │
│   │    [Contraseña]                 │   │
│   │    [Iniciar Sesión]             │   │
│   │                                 │   │
│   │  ¿No tienes cuenta?             │   │
│   │  Regístrate aquí                │   │
│   └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘

TODO LO DEMÁS: ❌ OCULTO
```

### DESPUÉS DL LOGIN (Sesión Activa)
```
┌──────────────────────────────────────────────┐
│ [Productos] [Ventas] [Cuentas] [Historial]   │
│                         miusuario [Salir]     │ HEADER
├──────────────────────────────────────────────┤
│                                              │
│  📦 PRODUCTOS & STOCK                        │
│  [Agregar Producto] [Escanear]               │
│  ┌────────────────────────────────────────┐  │
│  │ Laptop.........$500.....Stock: 5      │  │
│  │ Mouse.........$25........Stock: 50     │  │
│  └────────────────────────────────────────┘  │ CONTENIDO
│                                              │ PRINCIPAL
│  💳 VENTAS                                   │ VISIBLE
│  ┌────────────────────────────────────────┐  │
│  │ [Agregar Producto]                     │  │
│  │ Total: $0.00                           │  │
│  │ [Registrar Venta]                      │  │
│  └────────────────────────────────────────┘  │
│                                              │
└──────────────────────────────────────────────┘

TODO FUNCIONANDO: ✅
```

═════════════════════════════════════════════════════════

## 🔧 ARCHIVOS MODIFICADOS

✅ **index.html**
  - Modal de autenticación PRIMERO
  - Contenido principal envuelto en contenedor
  - Inicialmente oculto (display: none)

✅ **auth.js**
  - showAuthModal(): Muestra modal, oculta contenido
  - hideAuthModal(): Oculta modal, muestra contenido
  - Carga automática de datos

✅ **codigo.js**
  - actualizarUI() al cargar datos
  - Todas las funciones de actualización

✅ **styles.css**
  - Modal visible y centrado
  - Estilos integrados con variables CSS
  - Animaciones suaves

═════════════════════════════════════════════════════════

## ⚠️ PROBLEMAS COMUNES

### "El modal no desaparece después del login"
→ Abre F12, Console
→ Verifica si hay errores en rojo
→ Mira en Network tab si /api/appdata devuelve datos

### "No puedo registrarme, dice 'usuario ya existe'"
→ El usuario ya está en la BD
→ Utiliza un nombre diferente
→ Ejemplo: user_$(date +%s)

### "Después del login, no veo los datos"
→ Abre DevTools (F12) → Network
→ Recarga la página
→ Busca GET /api/appdata (debe ser 200 Status)
→ Verifica que devuelve JSON con datos

### "El servidor no inicia"
→ Puerto 3000 ocupado:
  netstat -ano | findstr :3000
  taskkill /PID {PID} /F
→ Faltan dependencias:
  npm install --save

═════════════════════════════════════════════════════════

## ✨ CARACTERÍSTICAS IMPLEMENTADAS

✅ Login y Registro (validación completa)
✅ JWT Tokens (7 días expira)
✅ Contraseñas hasheadas (bcrypt)
✅ Datos aislados por usuario (SQLite)
✅ Sesión persistente (localStorage)
✅ Auto-logout en F5 si hay sesión
✅ UI automática cuando se carga
✅ Estilos integrados y responsive
✅ Modal solo se muestra sin sesión
✅ Contenido principal solo con sesión

═════════════════════════════════════════════════════════

## 🎯 PRÓXIMOS PASOS (OPCIONALES)

1. **Cambiar contraseña**
   - Nueva ruta POST /api/auth/change-password

2. **Recuperar contraseña**
   - Email de recuperación
   - Link con token temporal

3. **2FA (Autenticación de Dos Factores)**
   - OTP por email o SMS

4. **Auditoría**
   - Log de cambios
   - Historial de sesiones

═════════════════════════════════════════════════════════

🚀 **¡Tu sistema POS está listo para usar!**

Cualquier duda, verifica los archivos:
  • FLUJO_AUTENTICACION.md
  • LEER_PRIMERO.md
  • VERIFICACION.md
  • RESUMEN_IMPLEMENTACION.md
