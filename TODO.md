# Sistema de Autenticación - KevStore

## Resumen de Implementación

### Archivos Creados:
- **auth-system.js**: Nuevo módulo de autenticación completo con:
  - Sistema de tokens con expiración
  - Funciones de login, registro y logout
  - Validación con servidor y modo offline fallback
  - UI para mostrar/ocultar modal de autenticación
  - Integración con el sistema de autenticación existente

### Archivos Modificados:
- **index.html**: Ahora carga auth-system.js antes de auth.js y codigo.js
- **codigo.js**: Agregada función `window.clearAppData()` para limpiar datos al hacer logout

### Flujo de Autenticación:
1. **Carga de página**: auth-system.js inicializa el sistema
2. **Sin sesión activa**: Muestra modal de login/registro
3. **Con sesión activa**: Valida token y muestra la app principal
4. **Logout**: Limpia datos y muestra el modal de autenticación

### Características del Sistema:
- Tokens con expiración de 7 días
- Modo offline fallback (permite uso sin servidor)
- Validación de credenciales en servidor
- Persistencia de sesión en localStorage
- Integración completa con la aplicación principal

