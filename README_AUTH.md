# Sistema de Punto de Venta (POS) - Secure Edition

Un sistema completo de punto de venta con autenticación segura, gestión de usuarios, y almacenamiento de datos protegido.

## Características

✅ **Sistema de Autenticación Seguro**
- Registro de nuevos usuarios
- Login con usuario o email
- Contraseñas cifradas con bcrypt
- Tokens JWT para sesiones seguras

✅ **Gestión de Datos por Usuario**
- Cada usuario tiene sus propios datos completamente separados
- Almacenamiento en base de datos SQLite
- Sincronización con servidor automática

✅ **Módulos del POS**
- **Productos & Stock**: Gestión de catálogo de productos
- **Ventas**: Registro de transacciones con múltiples métodos de pago
- **Cuentas Corrientes**: Control de crédito a clientes
- **Historial**: Registro completo de todas las operaciones
- **Movimiento de Caja**: Control de efectivo y retiros

✅ **Seguridad**
- Autenticación basada en JWT
- Contraseñas hasheadas
- Datos aislados por usuario
- API protegida con middleware de validación

## Instalación

### Requisitos
- Node.js 14 o superior
- npm

### Paso a Paso

1. **Instalar dependencias**
```bash
npm install
```

2. **Iniciar el servidor**
```bash
npm start
```

El servidor iniciará en `http://localhost:3000`

Para desarrollo con reinicio automático:
```bash
npm run dev
```

## Uso

### Primer Acceso

1. Abre `http://localhost:3000` en tu navegador
2. Verás la pantalla de autenticación
3. Click en "Regístrate aquí" para crear una nueva cuenta
4. Completa los datos:
   - **Usuario**: 3-20 caracteres (letras, números, guiones)
   - **Email**: Email válido
   - **Contraseña**: Mínimo 8 caracteres

### Iniciar Sesión

1. Ingresa tu usuario o email
2. Ingresa tu contraseña
3. Haz click en "Iniciar Sesión"

### Cerrar Sesión

1. En la esquina superior derecha del header
2. Haz click en "Salir"
3. Confirma la acción

## Estructura del Proyecto

```
.
├── index.html          # Frontend HTML
├── styles.css          # Estilos CSS
├── codigo.js           # Lógica principal del POS
├── auth.js             # Módulo de autenticación
├── server.js           # Servidor Node.js con rutas API
├── package.json        # Dependencias y scripts
├── datos.db            # Base de datos SQLite (autogenerada)
└── libs/               # Librerías externas (PDF, etc)
```

## API Endpoints

### Autenticación

**POST `/api/auth/register`**
```json
{
  "usuario": "miusuario",
  "email": "mi@email.com",
  "password": "micontraseña123"
}
```

**POST `/api/auth/login`**
```json
{
  "usuario": "miusuario",
  "password": "micontraseña123"
}
```

**POST `/api/auth/validate`** (Requiere Token)
Valida que el token JWT sea válido

**POST `/api/auth/logout`** (Requiere Token)
Cierra la sesión

### Datos del Usuario

**GET `/api/appdata`** (Requiere Token)
Obtiene todos los datos del usuario autenticado

**POST `/api/appdata`** (Requiere Token)
Guarda los datos del usuario autenticado

## Seguridad

### Contraseñas
- Se hashean con bcrypt (algoritmo de hashing seguro)
- Nunca se almacenan en texto plano
- Las contraseñas incorrectas se verifican de forma segura

### Tokens JWT
- Expiran cada 7 días
- Se almacenan en localStorage del navegador
- Se envían en cada solicitud a la API mediante el header `Authorization`

### Datos
- Los datos de cada usuario están completamente aislados en la base de datos
- Un usuario no puede acceder a datos de otro usuario
- La API valida el token en cada solicitud

## Funcionalidades del POS

### Productos & Stock
- Agregar productos con precio y stock inicial
- Editar precios y stock en tiempo real
- Generar códigos especiales para productos sin código de barras
- Escanear códigos de barras automáticamente

### Ventas
- Registrar ventas con uno o múltiples productos
- Soporte para múltiples métodos de pago
- Pago dividido entre varios métodos
- Asignación manual de pagos por producto

### Cuentas Corrientes
- Registrar cargos (deudas) de clientes
- Registrar abonos (pagos)
- Asociar productos a cuentas corrientes
- Ver saldo de cada cliente

### Movimiento de Caja
- Registrar retiros de caja
- Contar billetes físicos
- Seguimiento de efectivo disponible
- Historial de movimientos

### Historial
- Registro completo de todas las operaciones
- Filtrado por fecha con calendario interactivo
- Resumen de ventas por día
- Detalles de transacciones

## Exportación de Datos

- **JSON**: Descargar datos en formato JSON
- **CSV**: Exportar a formato CSV para Excel
- **Backup Cifrado**: Crear backup con contraseña opcional
- **Últimos 30 días**: Opción para exportar solo datos recientes

## Solución de Problemas

### "Error al iniciar sesión"
- Verifica que el usuario y contraseña sean correctos
- Asegúrate de que el servidor esté ejecutándose
- Prueba refrescando la página

### "Error al guardar datos"
- Los datos se guardarán localmente si el servidor no responde
- Verifica que tengas conexión a internet
- Revisa la consola del navegador (F12) para más detalles

### "La base de datos no se crea"
- Asegúrate de tener permisos de escritura en la carpeta
- Verifica que Node.js esté correctamente instalado
- Intenta eliminar `datos.db` y reiniciar el servidor

## Variables de Entorno

Opcionalmente, puedes configurar:

```bash
# Puerto diferente
PORT=3001

# Secreto JWT personalizado (cambiar en producción)
JWT_SECRET=tu-secreto-muy-seguro-aqui
```

## Notas para Producción

⚠️ **IMPORTANTE**: Si planeas usar esto en producción:

1. Cambia `JWT_SECRET` en el código por algo único y seguro
2. Usa HTTPS en lugar de HTTP
3. Configura un firewall adecuado
4. Realiza backups automáticos de `datos.db`
5. Considera usar una base de datos más robusta (PostgreSQL)
6. Implementa rate limiting para las rutas de login
7. Agrega validación de email con confirmación
8. Implementa recuperación de contraseña

## Licencia

MIT

## Soporte

Para reportar bugs o sugerir mejoras, por favor abre un issue en el repositorio.
