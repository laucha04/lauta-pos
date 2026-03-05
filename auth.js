/* ========== MÓDULO DE AUTENTICACIÓN ========== */

// Estado de autenticación global
window.currentUser = null;
window.authToken = null;

// Aliases para uso interno
let currentUser = window.currentUser;
let authToken = window.authToken;

// Función para verificar si el usuario está autenticado
function isAuthenticated() {
  return window.authToken !== null && window.authToken !== undefined && window.authToken !== '';
}

// Cargar estado de autenticación al iniciar
function initializeAuth() {
  const stored = localStorage.getItem('authToken');
  const userData = localStorage.getItem('userData');
  
  if (stored && userData) {
    try {
      window.authToken = stored;
      window.currentUser = JSON.parse(userData);
      authToken = stored;
      currentUser = window.currentUser;
      // Validar token con servidor (opcional)
      validateTokenWithServer();
      // Cargar datos del usuario
      loadAppData();
      hideAuthModal();
      return true;
    } catch (e) {
      console.error('Error al restaurar sesión:', e);
      clearAuthSession();
      showAuthModal();
    }
  } else {
    // Si no hay sesión, mostrar modal de login
    showAuthModal();
  }
  return false;
}

// Mostrar modal de autenticación
function showAuthModal() {
  const modal = document.getElementById('auth-modal');
  const appContainer = document.getElementById('main-app-container');
  if (modal) {
    modal.setAttribute('aria-hidden', 'false');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
  if (appContainer) {
    appContainer.style.display = 'none';
  }
  // Remove section-fullscreen class when showing auth modal
  document.body.classList.remove('section-fullscreen');
  // Hide all main sections when showing auth modal
  const mainSections = document.querySelectorAll('.main-section');
  mainSections.forEach(sec => sec.classList.remove('active'));
}

// Ocultar modal de autenticación
function hideAuthModal() {
  const modal = document.getElementById('auth-modal');
  const appContainer = document.getElementById('main-app-container');
  if (modal) {
    modal.setAttribute('aria-hidden', 'true');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
  }
  if (appContainer) {
    appContainer.style.display = 'flex';
  }
  updateUserDisplay();
  
  // Show the main app after hiding modal (use window to handle codigo.js not loaded yet)
  setTimeout(() => {
    if (typeof window.showMainApp === 'function') {
      window.showMainApp();
    } else {
      // Try again after a short delay if not available yet
      setTimeout(() => {
        if (typeof window.showMainApp === 'function') {
          window.showMainApp();
        }
      }, 200);
    }
  }, 100);
}

// Actualizar visualización del usuario en el header
function updateUserDisplay() {
  const userInfo = document.getElementById('auth-user-info');
  const userDisplay = document.getElementById('auth-user-display');
  
  if (currentUser && userInfo && userDisplay) {
    userInfo.style.display = 'flex';
    userDisplay.textContent = currentUser.usuario || currentUser.email || 'Usuario';
  } else if (userInfo) {
    userInfo.style.display = 'none';
  }
}

// Validar token con servidor
async function validateTokenWithServer() {
  try {
    const response = await fetch('/api/auth/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (!response.ok) {
      clearAuthSession();
      showAuthModal();
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Error validando token:', err);
    // Continuar sin validación si el servidor no responde
    return true;
  }
}

// Limpiar sesión
function clearAuthSession() {
  window.currentUser = null;
  window.authToken = null;
  currentUser = null;
  authToken = null;
  localStorage.removeItem('authToken');
  localStorage.removeItem('userData');
  localStorage.removeItem('appData');
}

// FUNCIONES DE FORMULARIO

// Manejar toggle entre login y registro
document.addEventListener('DOMContentLoaded', () => {
  const toggleToRegister = document.getElementById('toggle-to-register');
  const toggleToLogin = document.getElementById('toggle-to-login');
  const loginForm = document.getElementById('auth-login-form');
  const registerForm = document.getElementById('auth-register-form');
  
  if (toggleToRegister) {
    toggleToRegister.addEventListener('click', (e) => {
      e.preventDefault();
      loginForm.classList.remove('auth-form-active');
      registerForm.classList.add('auth-form-active');
    });
  }
  
  if (toggleToLogin) {
    toggleToLogin.addEventListener('click', (e) => {
      e.preventDefault();
      registerForm.classList.remove('auth-form-active');
      loginForm.classList.add('auth-form-active');
    });
  }

  // Manejar envío del formulario de login
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleLogin();
    });
  }

  // Manejar envío del formulario de registro
  if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleRegister();
    });
  }

  // Manejar logout
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', handleLogout);
  }
});

// Función de Login
async function handleLogin() {
  const usuario = document.getElementById('login-usuario').value.trim();
  const password = document.getElementById('login-password').value;
  
  // Validación básica
  if (!usuario || !password) {
    showAuthError('login-error', 'Por favor completa todos los campos');
    return;
  }
  
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      showAuthError('login-error', data.error || 'Error en el inicio de sesión');
      return;
    }
    
    // Guardar token y datos de usuario
    window.authToken = data.token;
    window.currentUser = data.user;
    authToken = data.token;
    currentUser = data.user;
    
    localStorage.setItem('authToken', authToken);
    localStorage.setItem('userData', JSON.stringify(currentUser));
    
    showToast(`¡Bienvenido ${currentUser.usuario}!`, 'success');
    hideAuthModal();
    
    // Cargar datos del usuario
    loadAppData();
  } catch (err) {
    console.error('Error en login:', err);
    // MODO FALLBACK: Si no hay servidor, permitir acceso local
    console.warn('Servidor no disponible, usando modo local');
    window.authToken = 'local-token-' + Date.now();
    window.currentUser = { id: 'local', usuario: usuario, email: usuario + '@local' };
    authToken = window.authToken;
    currentUser = window.currentUser;
    
    localStorage.setItem('authToken', authToken);
    localStorage.setItem('userData', JSON.stringify(currentUser));
    
    showToast(`¡Bienvenido ${usuario}! (modo offline)`, 'success');
    hideAuthModal();
    loadAppData();
  }
}

// Función de Registro
async function handleRegister() {
  const usuario = document.getElementById('register-usuario').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  const passwordConfirm = document.getElementById('register-password-confirm').value;
  
  // Validaciones
  if (!usuario || !email || !password || !passwordConfirm) {
    showAuthError('register-error', 'Por favor completa todos los campos');
    return;
  }
  
  if (usuario.length < 3 || usuario.length > 20) {
    showAuthError('register-error', 'El usuario debe tener entre 3 y 20 caracteres');
    return;
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(usuario)) {
    showAuthError('register-error', 'El usuario solo puede contener letras, números, guiones y guiones bajos');
    return;
  }
  
  if (password.length < 8) {
    showAuthError('register-error', 'La contraseña debe tener al menos 8 caracteres');
    return;
  }
  
  if (password !== passwordConfirm) {
    showAuthError('register-error', 'Las contraseñas no coinciden');
    return;
  }
  
  // Validar email básico
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showAuthError('register-error', 'Email inválido');
    return;
  }
  
  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, email, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      showAuthError('register-error', data.error || 'Error al registrarse');
      return;
    }
    
    showToast('Cuenta creada exitosamente. Inicia sesión ahora.', 'success');
    
    // Cambiar a formulario de login
    document.getElementById('auth-register-form').classList.remove('auth-form-active');
    document.getElementById('auth-login-form').classList.add('auth-form-active');
    
    // Prellenar usuario
    document.getElementById('login-usuario').value = usuario;
    document.getElementById('login-password').value = '';
    document.getElementById('login-password').focus();
  } catch (err) {
    console.error('Error en registro:', err);
    showAuthError('register-error', 'Error de conexión. Intenta nuevamente.');
  }
}

// Función de Logout
async function handleLogout() {
  if (!confirm('¿Estás seguro de que deseas cerrar sesión?')) {
    return;
  }
  
  try {
    // Notificar al servidor (opcional)
    if (authToken) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      }).catch(() => {});
    }
  } catch (err) {
    console.error('Error en logout:', err);
  }
  
  // Limpiar sesión local
  clearAuthSession();
  
  // Limpiar datos de la app
  if (typeof window.clearAppData === 'function') {
    window.clearAppData();
  }
  
  showToast('Sesión cerrada', 'success');
  showAuthModal();
}

// Mostrar error en formulario
function showAuthError(elementId, message) {
  const errorDiv = document.getElementById(elementId);
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
      errorDiv.style.display = 'none';
    }, 5000);
  }
}

// Función para reinicializar listeners de la app (llamada después del login)
function reinitializeAppListeners() {
  // Los listeners ya están inicializados en codigo.js
  // Esta función puede expandirse si hay listeners que necesiten reinicialización
  console.log('App listeners reinitialized');
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    initializeAuth();
  }, 100);
});

