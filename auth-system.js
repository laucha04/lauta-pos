/**
 * ============================================
 * SISTEMA DE AUTENTICACIÓN - KevStore
 * ============================================
 * Módulo completo para gestión de usuarios,
 * login, registro y control de sesiones.
 */

(function() {
  'use strict';

  // ============================================
  // CONFIGURACIÓN
  // ============================================
  const AUTH_CONFIG = {
    TOKEN_KEY: 'kevstore_auth_token',
    USER_KEY: 'kevstore_user_data',
    SESSION_KEY: 'kevstore_session',
    TOKEN_EXPIRY: 7 * 24 * 60 * 60 * 1000, // 7 días en ms
    API_ENDPOINTS: {
      login: '/api/auth/login',
      register: '/api/auth/register',
      logout: '/api/auth/logout',
      validate: '/api/auth/validate'
    }
  };

  // ============================================
  // ESTADO GLOBAL
  // ============================================
  let AuthSystem = {
    currentUser: null,
    isAuthenticated: false,
    token: null,
    initializationComplete: false
  };

  // Exponer al objeto window para acceso global
  window.AuthSystem = AuthSystem;

  // ============================================
  // FUNCIONES DE UTILIDAD
  // ============================================

  /**
   * Genera un token aleatorio seguro
   */
  function generateToken() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Guarda el token en localStorage
   */
  function saveToken(token) {
    try {
      const expiryDate = new Date(Date.now() + AUTH_CONFIG.TOKEN_EXPIRY);
      localStorage.setItem(AUTH_CONFIG.TOKEN_KEY, JSON.stringify({
        token: token,
        expiry: expiryDate.getTime()
      }));
      AuthSystem.token = token;
      return true;
    } catch (e) {
      console.error('Error guardando token:', e);
      return false;
    }
  }

  /**
   * Obtiene el token de localStorage
   */
  function getToken() {
    try {
      const stored = localStorage.getItem(AUTH_CONFIG.TOKEN_KEY);
      if (!stored) return null;
      
      const data = JSON.parse(stored);
      if (data.expiry && Date.now() > data.expiry) {
        // Token expirado
        clearAuthData();
        return null;
      }
      return data.token;
    } catch (e) {
      console.error('Error obteniendo token:', e);
      return null;
    }
  }

  /**
   * Guarda los datos del usuario
   */
  function saveUserData(user) {
    try {
      localStorage.setItem(AUTH_CONFIG.USER_KEY, JSON.stringify(user));
      AuthSystem.currentUser = user;
      return true;
    } catch (e) {
      console.error('Error guardando datos de usuario:', e);
      return false;
    }
  }

  /**
   * Obtiene los datos del usuario
   */
  function getUserData() {
    try {
      const stored = localStorage.getItem(AUTH_CONFIG.USER_KEY);
      if (!stored) return null;
      return JSON.parse(stored);
    } catch (e) {
      console.error('Error obteniendo datos de usuario:', e);
      return null;
    }
  }

  /**
   * Limpia todos los datos de autenticación
   */
  function clearAuthData() {
    localStorage.removeItem(AUTH_CONFIG.TOKEN_KEY);
    localStorage.removeItem(AUTH_CONFIG.USER_KEY);
    localStorage.removeItem(AUTH_CONFIG.SESSION_KEY);
    AuthSystem.currentUser = null;
    AuthSystem.isAuthenticated = false;
    AuthSystem.token = null;
    // Limpiar variables globales
    window.authToken = null;
    window.currentUser = null;
  }

  // ============================================
  // FUNCIONES PRINCIPALES DE AUTENTICACIÓN
  // ============================================

  /**
   * Verifica si el usuario está autenticado
   */
  function checkAuthentication() {
    const token = getToken();
    const user = getUserData();
    
    if (token && user) {
      AuthSystem.token = token;
      AuthSystem.currentUser = user;
      AuthSystem.isAuthenticated = true;
      // Sincronizar con variables globales para compatibilidad
      window.authToken = token;
      window.currentUser = user;
      return true;
    }
    
    AuthSystem.isAuthenticated = false;
    return false;
  }

  /**
   * Realiza el proceso de login
   * @param {string} username - Nombre de usuario o email
   * @param {string} password - Contraseña
   * @returns {Promise<{success: boolean, error?: string, user?: object}>}
   */
  async function login(username, password) {
    // Validación de entrada
    if (!username || !password) {
      return { success: false, error: 'Por favor completa todos los campos' };
    }

    try {
      // Intentar login con el servidor
      const response = await fetch(AUTH_CONFIG.API_ENDPOINTS.login, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          usuario: username.trim(), 
          password: password 
        })
      });

      const data = await response.json();

      if (!response.ok) {
        return { 
          success: false, 
          error: data.error || 'Error en el inicio de sesión' 
        };
      }

      // Login exitoso - guardar datos
      if (data.token && data.user) {
        saveToken(data.token);
        saveUserData(data.user);
        AuthSystem.isAuthenticated = true;
        // Sincronizar con variables globales para compatibilidad
        window.authToken = data.token;
        window.currentUser = data.user;
        
        return { 
          success: true, 
          user: data.user 
        };
      }

      return { success: false, error: 'Respuesta inválida del servidor' };

    } catch (error) {
      console.error('Error en login:', error);
      
      // MODO FALLBACK: Si no hay servidor, permitir acceso local
      console.warn('Servidor no disponible, usando modo offline');
      
      const localToken = 'local-' + generateToken();
      const localUser = {
        id: 'local-' + Date.now(),
        usuario: username.trim(),
        email: username.trim() + '@local',
        createdAt: new Date().toISOString()
      };
      
      saveToken(localToken);
      saveUserData(localUser);
      AuthSystem.isAuthenticated = true;
      
      return { 
        success: true, 
        user: localUser,
        isOffline: true
      };
    }
  }

  /**
   * Realiza el proceso de registro
   * @param {string} username - Nombre de usuario
   * @param {string} email - Email del usuario
   * @param {string} password - Contraseña
   * @param {string} confirmPassword - Confirmación de contraseña
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function register(username, email, password, confirmPassword) {
    // Validaciones
    if (!username || !email || !password || !confirmPassword) {
      return { success: false, error: 'Por favor completa todos los campos' };
    }

    if (username.length < 3 || username.length > 20) {
      return { success: false, error: 'El usuario debe tener entre 3 y 20 caracteres' };
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return { success: false, error: 'El usuario solo puede contener letras, números, guiones y guiones bajos' };
    }

    if (password.length < 8) {
      return { success: false, error: 'La contraseña debe tener al menos 8 caracteres' };
    }

    if (password !== confirmPassword) {
      return { success: false, error: 'Las contraseñas no coinciden' };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: 'Email inválido' };
    }

    try {
      const response = await fetch(AUTH_CONFIG.API_ENDPOINTS.register, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          usuario: username.trim(),
          email: email.trim(),
          password: password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Error al registrarse'
        };
      }

      return { success: true };

    } catch (error) {
      console.error('Error en registro:', error);
      return { success: false, error: 'Error de conexión. Intenta nuevamente.' };
    }
  }

  /**
   * Cierra la sesión del usuario
   */
  async function logout() {
    try {
      // Notificar al servidor
      const token = getToken();
      if (token) {
        await fetch(AUTH_CONFIG.API_ENDPOINTS.logout, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }).catch(() => {}); // Ignorar errores
      }
    } catch (e) {
      console.error('Error en logout:', e);
    }

    // Limpiar datos locales
    clearAuthData();
    
    return true;
  }

  /**
   * Valida el token con el servidor
   */
  async function validateToken() {
    const token = getToken();
    if (!token) return false;

    try {
      const response = await fetch(AUTH_CONFIG.API_ENDPOINTS.validate, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      return response.ok;
    } catch (e) {
      // Si el servidor no responde, asumimos que el token local es válido
      return token.startsWith('local-');
    }
  }

  // ============================================
  // FUNCIONES DE INTERFAZ (UI)
  // ============================================

  /**
   * Muestra el modal de autenticación
   */
  function showAuthModal() {
    const modal = document.getElementById('auth-modal');
    const appContainer = document.getElementById('main-app-container');
    
    if (modal) {
      modal.setAttribute('aria-hidden', 'false');
      modal.style.display = 'flex';
      // Enfocar el primer campo
      setTimeout(() => {
        const firstInput = modal.querySelector('input:not([type="hidden"])');
        if (firstInput) firstInput.focus();
      }, 100);
    }
    
    if (appContainer) {
      appContainer.style.display = 'none';
    }
    
    // Asegurar que el body no tenga scroll
    document.body.style.overflow = 'hidden';
    
    // Quitar clase de fullscreen
    document.body.classList.remove('section-fullscreen');
    
    // Ocultar todas las secciones
    const sections = document.querySelectorAll('.main-section');
    sections.forEach(sec => sec.classList.remove('active'));
  }

  /**
   * Oculta el modal de autenticación
   */
  function hideAuthModal() {
    const modal = document.getElementById('auth-modal');
    const appContainer = document.getElementById('main-app-container');
    
    if (modal) {
      modal.setAttribute('aria-hidden', 'true');
      modal.style.display = 'none';
    }
    
    if (appContainer) {
      appContainer.style.display = 'flex';
    }
    
    // Restaurar scroll
    document.body.style.overflow = '';
    
    // Actualizar显示 del usuario
    updateUserDisplay();
  }

  /**
   * Actualiza la visualización del usuario en el header
   */
  function updateUserDisplay() {
    const userInfo = document.getElementById('auth-user-info');
    const userDisplay = document.getElementById('auth-user-display');
    
    if (AuthSystem.currentUser && userInfo && userDisplay) {
      const displayName = AuthSystem.currentUser.usuario || 
                         AuthSystem.currentUser.email || 
                         'Usuario';
      userInfo.style.display = 'flex';
      userDisplay.textContent = displayName;
    } else if (userInfo) {
      userInfo.style.display = 'none';
    }
  }

  /**
   * Muestra un mensaje de error en el formulario
   */
  function showError(elementId, message) {
    const errorDiv = document.getElementById(elementId);
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
      
      // Ocultar después de 5 segundos
      setTimeout(() => {
        errorDiv.style.display = 'none';
      }, 5000);
    }
  }

  /**
   * Oculta un mensaje de error
   */
  function hideError(elementId) {
    const errorDiv = document.getElementById(elementId);
    if (errorDiv) {
      errorDiv.style.display = 'none';
    }
  }

  /**
   * Cambia entre formularios de login y registro
   */
  function switchAuthForm(formName) {
    const loginForm = document.getElementById('auth-login-form');
    const registerForm = document.getElementById('auth-register-form');
    
    hideError('login-error');
    hideError('register-error');
    
    if (formName === 'register') {
      loginForm.classList.remove('auth-form-active');
      registerForm.classList.add('auth-form-active');
      // Enfocar primer campo del formulario de registro
      setTimeout(() => {
        const firstInput = registerForm.querySelector('input');
        if (firstInput) firstInput.focus();
      }, 100);
    } else {
      registerForm.classList.remove('auth-form-active');
      loginForm.classList.add('auth-form-active');
      // Enfocar primer campo del formulario de login
      setTimeout(() => {
        const firstInput = loginForm.querySelector('input');
        if (firstInput) firstInput.focus();
      }, 100);
    }
  }

  /**
   * Muestra notificación toast
   */
  function showNotification(message, type = 'success') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
    } else {
      // Fallback simple
      alert(message);
    }
  }

  // ============================================
  // INICIALIZACIÓN
  // ============================================

  /**
   * Inicializa el sistema de autenticación
   */
  function initialize() {
    // Verificar si hay sesión activa
    const hasSession = checkAuthentication();
    
    if (hasSession) {
      // Hay sesión - mostrar la app
      hideAuthModal();
      
      // Llamar a la función de la app para mostrar
      if (typeof window.showMainApp === 'function') {
        window.showMainApp();
      }
      
      // Cargar datos si existe la función
      if (typeof window.loadAppData === 'function') {
        window.loadAppData();
      }
    } else {
      // No hay sesión - mostrar modal de autenticación
      showAuthModal();
    }
    
    AuthSystem.initializationComplete = true;
  }

  /**
   * Configura los event listeners
   */
  function setupEventListeners() {
    // Toggle entre login y registro
    const toggleToRegister = document.getElementById('toggle-to-register');
    const toggleToLogin = document.getElementById('toggle-to-login');
    
    if (toggleToRegister) {
      toggleToRegister.addEventListener('click', (e) => {
        e.preventDefault();
        switchAuthForm('register');
      });
    }
    
    if (toggleToLogin) {
      toggleToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        switchAuthForm('login');
      });
    }

    // Formulario de login
    const loginForm = document.getElementById('auth-login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const usuario = document.getElementById('login-usuario').value.trim();
        const password = document.getElementById('login-password').value;
        
        hideError('login-error');
        
        const result = await login(usuario, password);
        
        if (result.success) {
          hideAuthModal();
          
          // Llamar a showMainApp después de un pequeño delay
          setTimeout(() => {
            if (typeof window.showMainApp === 'function') {
              window.showMainApp();
            }
            if (typeof window.loadAppData === 'function') {
              window.loadAppData();
            }
          }, 100);
          
          const welcomeMsg = result.isOffline 
            ? `¡Bienvenido ${result.user.usuario}! (modo offline)`
            : `¡Bienvenido ${result.user.usuario}!`;
          showNotification(welcomeMsg, 'success');
          
          // Limpiar formulario
          loginForm.reset();
        } else {
          showError('login-error', result.error);
        }
      });
    }

    // Formulario de registro
    const registerForm = document.getElementById('auth-register-form');
    if (registerForm) {
      registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const usuario = document.getElementById('register-usuario').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('register-password-confirm').value;
        
        hideError('register-error');
        
        const result = await register(usuario, email, password, confirmPassword);
        
        if (result.success) {
          showNotification('Cuenta creada exitosamente. Inicia sesión ahora.', 'success');
          switchAuthForm('login');
          
          // Pre-llenar usuario
          const loginUsuario = document.getElementById('login-usuario');
          const loginPassword = document.getElementById('login-password');
          if (loginUsuario) loginUsuario.value = usuario;
          if (loginPassword) {
            loginPassword.value = '';
            loginPassword.focus();
          }
          
          // Limpiar formulario de registro
          registerForm.reset();
        } else {
          showError('register-error', result.error);
        }
      });
    }

    // Botón de logout
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', async () => {
        if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
          // Limpiar datos de la app si existen las funciones
          if (typeof window.clearAppData === 'function') {
            window.clearAppData();
          }
          
          await logout();
          showAuthModal();
          showNotification('Sesión cerrada', 'success');
        }
      });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Escape para cerrar modal si está abierto
      if (e.key === 'Escape') {
        const modal = document.getElementById('auth-modal');
        if (modal && modal.getAttribute('aria-hidden') === 'false') {
          // Solo cerrar si no hay formulario activo
          const activeElement = document.activeElement;
          if (activeElement.tagName !== 'INPUT') {
            // No cerramos con Escape para permitir cancelación de forms
          }
        }
      }
    });
  }

  // ============================================
  // EXPORTAR FUNCIONES AL OBJETO GLOBAL
  // ============================================
  
  AuthSystem.initialize = initialize;
  AuthSystem.login = login;
  AuthSystem.register = register;
  AuthSystem.logout = logout;
  AuthSystem.showAuthModal = showAuthModal;
  AuthSystem.hideAuthModal = hideAuthModal;
  AuthSystem.checkAuthentication = checkAuthentication;
  AuthSystem.updateUserDisplay = updateUserDisplay;
  AuthSystem.showError = showError;
  AuthSystem.hideError = hideError;
  AuthSystem.switchAuthForm = switchAuthForm;

  // ============================================
  // INICIAR CUANDO EL DOM ESTÉ LISTO
  // ============================================
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupEventListeners();
      // Pequeño delay para asegurar que auth.js original esté cargado
      setTimeout(initialize, 50);
    });
  } else {
    // DOM ya está cargado
    setupEventListeners();
    setTimeout(initialize, 50);
  }

})();

