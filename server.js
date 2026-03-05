const express = require('express');
const path = require('path');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ===== ALMACENAMIENTO BASADO EN JSON =====
const DB_FILE = 'usuarios.json';
const DATA_FILE = 'app_data.json';

function loadUsers() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error cargando usuarios:', err);
  }
  return {};
}

function saveUsers(users) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (err) {
    console.error('Error guardando usuarios:', err);
  }
}

function loadAllAppData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error cargando datos:', err);
  }
  return {};
}

function saveAllAppData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error guardando datos:', err);
  }
}

// ===== CONFIGURACIÓN JWT =====
const JWT_SECRET = process.env.JWT_SECRET || 'tu-secreto-muy-seguro-cambiar-en-produccion';
const JWT_EXPIRY = '7d';

// ===== MIDDLEWARE =====

// Middleware para verificar JWT
function verificarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuarioId = decoded.id;
    req.usuario = decoded.usuario;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// ===== RUTAS DE AUTENTICACIÓN =====

// Registro
app.post('/api/auth/register', async (req, res) => {
  const { usuario, email, password } = req.body;
  
  // Validaciones
  if (!usuario || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }
  
  if (usuario.length < 3 || usuario.length > 20) {
    return res.status(400).json({ error: 'Usuario debe tener entre 3 y 20 caracteres' });
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(usuario)) {
    return res.status(400).json({ error: 'Usuario solo puede contener letras, números, guiones y guiones bajos' });
  }
  
  if (password.length < 8) {
    return res.status(400).json({ error: 'Contraseña debe tener al menos 8 caracteres' });
  }
  
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email inválido' });
  }
  
  try {
    const users = loadUsers();
    
    // Verificar si usuario o email ya existen
    if (Object.values(users).find(u => u.usuario === usuario || u.email === email)) {
      return res.status(400).json({ error: 'El usuario o email ya está registrado' });
    }
    
    // Hashear contraseña
    const passwordHash = await bcryptjs.hash(password, 10);
    
    // Crear ID único
    const userId = Date.now().toString();
    
    // Guardar usuario
    users[userId] = {
      id: userId,
      usuario,
      email,
      password_hash: passwordHash,
      created_at: new Date().toISOString()
    };
    
    saveUsers(users);
    
    // Crear registro vacío de datos del usuario
    const allData = loadAllAppData();
    allData[userId] = {
      clientes: [],
      productos: [],
      ventas: [],
      cuentas: [],
      cajaMovimientos: [],
      cajaBilletes: {},
      cajaBilletesRegistro: []
    };
    saveAllAppData(allData);
    
    res.status(201).json({
      success: true,
      message: 'Cuenta creada exitosamente'
    });
  } catch (err) {
    console.error('Error en registro:', err);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { usuario, password } = req.body;
  
  if (!usuario || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
  }
  
  try {
    const users = loadUsers();
    
    // Buscar usuario por usuario o email
    const user = Object.values(users).find(u => u.usuario === usuario || u.email === usuario);
    
    if (!user) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    
    // Verificar contraseña
    const passwordMatch = await bcryptjs.compare(password, user.password_hash);
    
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    
    // Generar JWT
    const token = jwt.sign(
      { id: user.id, usuario: user.usuario },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );
    
    res.json({
      token,
      user: {
        id: user.id,
        usuario: user.usuario,
        email: user.email
      }
    });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// Validar token
app.post('/api/auth/validate', verificarToken, (req, res) => {
  res.json({
    valid: true,
    usuario: req.usuario
  });
});

// Logout 
app.post('/api/auth/logout', verificarToken, (req, res) => {
  res.json({ success: true });
});

// ===== RUTAS DE DATOS PROTEGIDAS =====

// Obtener datos del usuario
app.get('/api/appdata', verificarToken, (req, res) => {
  try {
    const allData = loadAllAppData();
    const userData = allData[req.usuarioId] || {
      clientes: [],
      productos: [],
      ventas: [],
      cuentas: [],
      cajaMovimientos: [],
      cajaBilletes: {},
      cajaBilletesRegistro: []
    };
    
    res.json(userData);
  } catch (err) {
    console.error('Error obteniendo datos:', err);
    res.status(500).json({ error: 'Error al obtener datos' });
  }
});

// Guardar datos del usuario
app.post('/api/appdata', verificarToken, (req, res) => {
  try {
    const allData = loadAllAppData();
    allData[req.usuarioId] = req.body;
    saveAllAppData(allData);
    
    res.json({
      ok: true,
      message: 'Datos guardados exitosamente'
    });
  } catch (err) {
    console.error('Error guardando datos:', err);
    res.status(500).json({ error: 'Error al guardar datos' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Servidor funcionando correctamente' });
});

// Realizar copias de seguridad
app.get('/api/backup', verificarToken, (req, res) => {
  try {
    const allData = loadAllAppData();
    const data = allData[req.usuarioId] || {};
    
    res.json({
      backup: data,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error en backup:', err);
    res.status(500).json({ error: 'Error al generar backup' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✓ Servidor iniciado en http://localhost:${PORT}`);
  console.log('✓ Almacenamiento: usuarios.json y app_data.json');
  console.log('✓ Sistema de autenticación activado');
});
