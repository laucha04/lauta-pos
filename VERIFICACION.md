# Verificación del Sistema POS

## 🚀 Pasos para Verificar que TODO Funciona

### 1. **Iniciar el servidor**
```powershell
powershell -ExecutionPolicy Bypass -File iniciar.ps1
```

Deberías ver:
```
✓ Node.js encontrado: v18.x.x
✓ npm encontrado: 10.x.x
✓ Dependencias listas
Servidor iniciado en http://localhost:3000
Sistema de autenticación activado
```

### 2. **Abrir el navegador**
- Accede a: `http://localhost:3000`
- **Nota**: Usa `localhost`, no `127.0.0.1`
- Deberías ver el modal de login

### 3. **Registrarse (Nueva Cuenta)**
1. Click en "Regístrate aquí"
2. Completa el formulario:
   ```
   Usuario: testuser123
   Email: test@example.com
   Contraseña: password123
   Confirmar: password123
   ```
3. Click en "Crear Cuenta"
4. Deberías ver un toast: "¡Bienvenido testuser123!"
5. El modal desaparece
6. En la esquina superior derecha, verás "testuser123" con botón "Salir"

### 4. **Ingresar Datos**
Prueba agregando:
- **Productos**: Nombre: "Laptop", Precio: 500, Stock: 5
- **Ventas**: Selecciona la laptop, cantidad 1, método "Efectivo"
- **Cuentas**: Agrega un cliente con deuda
- **Caja**: Registra billetes

Deberías ver los datos aparecer en cada sección.

### 5. **Recargar la página (F5)**
Después de recargar:
- El modal NO debe aparecer (ya tienes sesión)
- Los datos DEBEN aparecer automáticamente
- Tu nombre sigue visible en el header

### 6. **Cerrar sesión**
1. Click en botón "Salir" en el header
2. Confirmar el diálogo
3. El modal de login debe aparecer nuevamente
4. Los datos deben estar vacíos

### 7. **Iniciar sesión nuevamente**
1. Usa las mismas credenciales que registraste
2. Los datos DEBEN reaparecer automáticamente
3. Tu nombre debe aparecer en el header

---

## 🔍 Verificación en Consola del Navegador

Presiona **F12** para abrir Developer Tools y ve a la pestaña **Console**.

### Esperados al cargar:
```javascript
"Inicializando autenticación..."
"No hay sesión activa. Mostrando modal de login"
"Sistema de autenticación integrado correctamente"
```

### Después de registrarse:
```javascript
"Token guardado: eyJhbGc..."
"Datos cargados desde servidor (appData): {...}"
"UI actualizada después de cargar datos"
```

### Si hay ERRORES (rojo):
- **"404 /api/auth/login"** → El servidor no está corriendo
- **"Failed to fetch"** → Verifica que uses `localhost:3000`
- **"Token inválido"** → Limpia localStorage y vuelve a registrarte

---

## 📝 Verificación de Base de Datos

### Ver usuarios registrados:
```powershell
# En otra ventana PowerShell
sqlite3 datos.db
sqlite> SELECT usuario, email FROM usuarios;
```

### Ver datos guardados de un usuario:
```sqlite
SELECT usuario_id, data FROM app_data;
```

---

## 🧪 Checklist Completo

- [ ] Servidor inicia sin errores
- [ ] Modal de login aparece al cargar
- [ ] Puedo registrar una nueva cuenta
- [ ] El token se guarda en localStorage
- [ ] Los datos se carguen automáticamente al registrarse
- [ ] El nombre del usuario aparece en el header
- [ ] Puedo agregar productos
- [ ] Puedo registrar ventas
- [ ] Puedo agregar cuentas corrientes
- [ ] Puedo recargar la página y los datos persisten
- [ ] Puedo cerrar sesión
- [ ] Puedo volver a iniciar sesión con las mismas credenciales
- [ ] Los datos reaparecen después de iniciar sesión

---

## ⚠️ Problemas Comunes

### "El modal no desaparece después del login"
- Revisa la consola: `console.log('hideAuthModal ejecutado')`
- Verifica que NO hay error en la red

### "Los datos no cargan después del login"
- Abre DevTools (F12) → Network
- Busca la petición `GET /api/appdata`
- Verifica que devuelve status 200 con datos JSON

### "El usuario no aparece en el header"
- Revisa: `console.log(currentUser)` en la consola
- Debería mostrar: `{id: 1, usuario: "testuser123", email: "test@example.com"}`

### "No puedo registrar porque dice 'usuario ya existe'"
- Usa un nombre de usuario único
- Puedes ver usuarios en SQLite: `sqlite3 datos.db "SELECT usuario FROM usuarios;"`

---

## 🔧 Debugging Avanzado

### Ver tráfico de red:
1. DevTools → Network tab
2. Filtra por "api"
3. Recarga la página
4. Verifica cada petición:
   - `/api/auth/login` → status 200, contiene token
   - `/api/appdata?GET` → status 200, contiene datos
   - `/api/appdata?POST` → status 200

### Ver localStorage:
```javascript
// En la consola:
console.log(localStorage.getItem('authToken'));
console.log(JSON.parse(localStorage.getItem('userData')));
console.log(JSON.parse(localStorage.getItem('appData')));
```

### Ver estado de autenticación:
```javascript
// En la consola:
console.log('Token:', authToken);
console.log('Usuario actual:', currentUser);
console.log('Array de productos:', productos.length);
console.log('Array de ventas:', ventas.length);
```

---

**¿Aún hay problemas? Verifica que:**
- ✅ Node.js v16+
- ✅ Puerto 3000 disponible
- ✅ `npm install` se ejecutó sin errores
- ✅ El navegador permite cookies/localStorage
