/* Datos y estados globales */
let clientes = [];
let productos = [];
let ventas = [];
let cuentas = [];
let cajaMovimientos = []; // array of { tipo: 'retiro', monto: number, motivo: string, fecha: 'YYYY-MM-DD' }
// Bill denominations tracking (count of bills per denomination)
const DENOMINACIONES = [100, 200, 500, 1000, 2000, 10000, 20000];
let cajaBilletes = {}; // map denom->count, e.g. {100: 0, 200: 3}
// initialize with zeros
DENOMINACIONES.forEach(d => cajaBilletes[d] = 0);
// registro diario de billetes: array of { fecha: 'YYYY-MM-DD', billetes: {100: n, ...}, total: number }
let cajaBilletesRegistro = [];

// Undo stack: stores short snapshots to allow quick 'undo' of destructive actions
const undoStack = [];
// Adds an undo snapshot, returns the internal id
function pushUndoSnapshot(label, snapshot, ttl = 20000) {
  const id = `${Date.now()}-${Math.floor(Math.random()*10000)}`;
  const entry = { id, label, snapshot, ts: Date.now(), expireAt: Date.now() + ttl };
  // ensure max length
  undoStack.unshift(entry);
  if (undoStack.length > 10) undoStack.pop();

  // schedule expiry removal
  entry._timer = setTimeout(() => { removeUndoById(id); }, ttl);
  renderUndoPanel();
  return id;
}

function populateCajaDayInputs(fecha = formatDate()) {
  const totals = calcularTotalesPorMediosEnFecha(fecha);
  const inpTarCredito = document.getElementById('caja-dia-tarjeta-credito');
  const inpTarDebito = document.getElementById('caja-dia-tarjeta-debito');
  const inpQR = document.getElementById('caja-dia-qr');
  const inpTr = document.getElementById('caja-dia-transferencia');
  const inpM = document.getElementById('caja-dia-mercado');
  if (inpTarCredito) inpTarCredito.value = ((totals.tarjeta_credito != null ? totals.tarjeta_credito : totals.tarjeta) || 0).toFixed(2);
  if (inpTarDebito) inpTarDebito.value = (totals.tarjeta_debito || 0).toFixed(2);
  if (inpQR) inpQR.value = (totals.qr || 0).toFixed(2);
  if (inpTr) inpTr.value = (totals.transferencia || 0).toFixed(2);
  if (inpM) inpM.value = (totals.mercado_pago || 0).toFixed(2);
}

// Helper to copy text to clipboard with fallback and toast feedback
function copyToClipboard(text) {
  return new Promise((resolve, reject) => {
    if (!text) {
      showToast('Nada para copiar', 'error');
      return reject(new Error('Nada para copiar'));
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('Código copiado al portapapeles', 'success');
        resolve();
      }).catch((err) => {
        console.warn('navigator.clipboard failed', err);
        fallbackCopy(text).then(resolve).catch(reject);
      });
    } else {
      fallbackCopy(text).then(resolve).catch(reject);
    }
  });
}

function fallbackCopy(text) {
  return new Promise((resolve, reject) => {
    try {
      const tmp = document.createElement('input');
      tmp.value = text;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      document.body.removeChild(tmp);
      showToast('Código copiado al portapapeles', 'success');
      resolve();
    } catch (err) {
      console.error('Fallback copy failed', err);
      showToast('No fue posible copiar el código', 'error');
      reject(err);
    }
  });
}

function removeUndoById(id) {
  const idx = undoStack.findIndex(e => e.id === id);
  if (idx === -1) return false;
  const [entry] = undoStack.splice(idx, 1);
  if (entry && entry._timer) clearTimeout(entry._timer);
  renderUndoPanel();
  return true;
}

function popUndoSnapshot() { if (undoStack.length === 0) return null; const e = undoStack.shift(); if (e && e._timer) clearTimeout(e._timer); renderUndoPanel(); return e; }

function renderUndoPanel() {
  const panel = document.getElementById('undo-panel');
  if (!panel) return;
  if (undoStack.length === 0) { panel.innerHTML = ''; panel.style.display = 'none'; return; }
  panel.style.display = 'flex';
  panel.innerHTML = undoStack.map(entry => {
    const ageSec = Math.round((Date.now() - entry.ts) / 1000);
    return `<div class="undo-item" data-id="${entry.id}"><div class="label">${escapeHtml(entry.label)}<div class="meta">hace ${ageSec}s</div></div><div><button class="btn btn-ghost undo-do" data-id="${entry.id}">Deshacer</button></div></div>`;
  }).join('');

  // attach handlers
  panel.querySelectorAll('.undo-do').forEach(btn => btn.addEventListener('click', (e) => {
    const id = btn.getAttribute('data-id');
    const entry = undoStack.find(x => x.id === id);
    if (!entry) return;
    try {
      const state = JSON.parse(entry.snapshot);
      clientes = state.clientes || [];
      productos = state.productos || [];
      ventas = state.ventas || [];
      cuentas = state.cuentas || [];
      saveAppData();
      actualizarListaClientes();
      actualizarListaProductosYStock();
      actualizarListaVentas();
      actualizarResumenCuentas();
      actualizarHistorial();
      updateVentaResumen();
      actualizarMovimientosCaja();
      showToast('Acción restaurada', 'success');
    } catch (err) { console.error('Error al restaurar desde undo panel', err); showToast('No fue posible restaurar', 'error'); }
    removeUndoById(id);
  }));
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// Generate a unique special code for products without barcode (alphanumeric, prefixed 'SP')
function generateUniqueSpecialCode() {
  const existing = new Set();
  productos.forEach(p => { if (p.codigoBarra) existing.add(String(p.codigoBarra)); if (p.codigoEspecial) existing.add(String(p.codigoEspecial)); });
  let code;
  do {
    code = 'SP' + (Math.floor(100000 + Math.random() * 900000));
  } while (existing.has(code));
  return code;
}

/* ----- Toaster notifications ----- */
function showToast(message, type = 'success', ttl = 3500, action = null) {
  let container = document.querySelector('.toasts');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toasts';
    document.body.appendChild(container);
  }
  const t = document.createElement('div');
  t.className = 'toast ' + (type === 'error' ? 'error' : 'success');
  t.setAttribute('role', 'status');
  t.setAttribute('aria-live', 'polite');
  t.setAttribute('aria-atomic', 'true');
  const iconName = type === 'error' ? 'icon-warning' : 'icon-check';
  t.innerHTML = `<svg class="toast-icon" aria-hidden="true" width="20" height="20"><use href="#${iconName}"></use></svg><div class="toast-text">${message}</div>`;
  if (action && typeof action === 'object' && action.label && typeof action.callback === 'function') {
    const actionBtn = document.createElement('button');
    actionBtn.className = 'toast-action btn btn-ghost';
    actionBtn.type = 'button';
    actionBtn.setAttribute('aria-label', action.label);
    actionBtn.textContent = action.label;
    actionBtn.addEventListener('click', (e) => {
      try { action.callback(); } catch (err) { console.error('Undo callback error', err); }
      // close the toast immediately
      remove();
    });
    t.appendChild(actionBtn);
  }
  t.innerHTML += `<button class="close" aria-label="Cerrar">&times;</button>`;
  container.appendChild(t);
  // let animation kick in
  setTimeout(() => t.classList.add('show'), 16);
  const closeBtn = t.querySelector('.close');
  const remove = () => { t.classList.remove('show'); t.classList.add('fading'); setTimeout(()=>t.remove(), 220); };
  closeBtn.addEventListener('click', remove);
  const autoRemTimer = setTimeout(remove, ttl);
  // if there's an action, keep a slightly longer time by default
  if (action) {
    clearTimeout(autoRemTimer);
    setTimeout(remove, Math.max(ttl, 6000));
  }
}

/* ----- Confirmation modal (returns Promise<boolean>) ----- */
function showConfirm(message, opts = { okLabel: 'Eliminar', cancelLabel: 'Cancelar' }) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const msg = document.getElementById('confirm-message');
    const btnOk = document.getElementById('confirm-ok');
    const btnCancel = document.getElementById('confirm-cancel');
    const modalPanel = modal ? modal.querySelector('.modal-panel') : null;
    // target main area to mark inert/aria-hidden while modal open
    const main = document.querySelector('.page');
    if (!modal || !msg || !btnOk || !btnCancel || !modalPanel) return resolve(false);

    // Save the previously focused element so we can restore on close
    const previousActive = document.activeElement;

    // configure labels and message
    msg.textContent = message;
    btnOk.textContent = opts.okLabel || 'Aceptar';
    btnCancel.textContent = opts.cancelLabel || 'Cancelar';

    // Open modal
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // mark background inert where supported, and set aria-hidden for screen readers
    try {
      if (main) {
        // add inert if available
        if ('inert' in HTMLElement.prototype) main.inert = true; else main.setAttribute('aria-hidden', 'true');
      }
    } catch (e) { /* ignore */ }

    // find all focusable elements inside modal (visible and enabled)
    const focusableSelector = 'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusableElements = Array.from(modalPanel.querySelectorAll(focusableSelector)).filter(el => el.offsetParent !== null);
    const firstFocusable = focusableElements[0] || btnCancel;
    const lastFocusable = focusableElements[focusableElements.length - 1] || btnOk;

    // Move focus to the first focusable element
    setTimeout(() => { try { firstFocusable.focus({ preventScroll: true }); } catch (err) {} }, 0);

    // Keydown handler to trap focus and handle Escape
    function onKeyDown(e) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault(); cleanup(false);
        return;
      }

      if (e.key === 'Tab') {
        // If no focusable elements, prevent leaving
        if (focusableElements.length === 0) { e.preventDefault(); return; }

        // standard focus trap: if Shift+Tab and focus on first -> go to last
        if (e.shiftKey && document.activeElement === firstFocusable) {
          e.preventDefault(); lastFocusable.focus();
          return;
        }

        // Tab on last -> wrap to first
        if (!e.shiftKey && document.activeElement === lastFocusable) {
          e.preventDefault(); firstFocusable.focus();
          return;
        }
        // otherwise let it move naturally
      }
    }

    // Cleanup / close modal (and restore focus)
    function cleanup(result) {
      if (modal.getAttribute('aria-hidden') === 'true') return; // already closed
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      // restore background
      try {
        if (main) { if ('inert' in HTMLElement.prototype) main.inert = false; else main.removeAttribute('aria-hidden'); }
      } catch (e) {}
      // remove event listeners
      modal.removeEventListener('keydown', onKeyDown);
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      const overlay = modal.querySelector('[data-close-modal]');
      if (overlay) overlay.removeEventListener('click', onOverlay);

      // restore focus
      try { previousActive && previousActive.focus({ preventScroll: true }); } catch (e) {}

      resolve(result);
    }

    function onOk(e) { e && e.preventDefault(); cleanup(true); }
    function onCancel(e) { e && e.preventDefault(); cleanup(false); }
    function onOverlay() { cleanup(false); }

    // add handlers
    modal.addEventListener('keydown', onKeyDown);
    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    const overlay = modal.querySelector('[data-close-modal]');
    if (overlay) overlay.addEventListener('click', onOverlay, { once: true });
  });
}

/* Small helper to render a consistent empty-state block */
function emptyStateHTML(message, sub = '') {
  const subHtml = sub ? `<div class="small muted" style="margin-left:4px">${sub}</div>` : '';
  return `<div class="empty-state"><svg class="icon" width="18" height="18" aria-hidden="true"><use href="#icon-box"></use></svg><div class="empty-content">${message}${subHtml}</div></div>`;
}

/* Función para guardar todos los datos en un solo objeto (intenta servidor con autenticación, fallback a localStorage) */
function saveAppData() {
  const appData = { clientes, productos, ventas, cuentas, cajaMovimientos, cajaBilletes, cajaBilletesRegistro };
  
  // Verificar si hay token de autenticación (puede estar en window o como variable global)
  const token = typeof authToken !== 'undefined' ? authToken : (typeof window.authToken !== 'undefined' ? window.authToken : null);
  
  // Si hay autenticación, guardar en servidor
  if (token) {
    fetch('/api/appdata', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(appData)
    }).then(res => {
      if (!res.ok) throw new Error('Server save failed');
      showToast('Datos guardados en servidor', 'success');
      console.log('Datos guardados en servidor (appData):', appData);
    }).catch(err => {
      console.warn('Error guardando en servidor, usando localStorage:', err);
      try {
        localStorage.setItem('appData', JSON.stringify(appData));
        showToast('Guardado localmente (fallback)', 'warning');
        console.log('Datos guardados en localStorage (fallback):', appData);
      } catch (e) {
        console.error('Error guardando datos en localStorage:', e);
        showToast('Error guardando datos localmente', 'error');
      }
    });
  } else {
    // Sin autenticación, guardar en localStorage
    try {
      localStorage.setItem('appData', JSON.stringify(appData));
      console.log('Datos guardados en localStorage:', appData);
    } catch (e) {
      console.error('Error guardando datos en localStorage:', e);
      showToast('Error guardando datos localmente', 'error');
    }
  }
}

/* Función para cargar todos los datos: intenta servidor con autenticación, luego fallback a localStorage */
async function loadAppData() {
  // Si hay autenticación, intenta cargar del servidor primero
  if (typeof authToken !== 'undefined' && authToken) {
    try {
      const res = await fetch('/api/appdata', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (!res.ok) throw new Error('No server data');
      const appData = await res.json();
      if (appData && Object.keys(appData).length > 0) {
        clientes = appData.clientes || [];
        productos = appData.productos || [];
        ventas = appData.ventas || [];
        cuentas = appData.cuentas || [];
        cajaMovimientos = appData.cajaMovimientos || [];
        cajaBilletes = appData.cajaBilletes || cajaBilletes;
        cajaBilletesRegistro = appData.cajaBilletesRegistro || cajaBilletesRegistro;
        // normalize registro entries
        if (Array.isArray(cajaBilletesRegistro)) {
          cajaBilletesRegistro = cajaBilletesRegistro.map(entry => {
            const normalized = { fecha: entry.fecha, billetes: {}, total: 0 };
            DENOMINACIONES.forEach(d => {
              const val = parseInt((entry.billetes && entry.billetes[d]) || 0) || 0;
              normalized.billetes[d] = val;
            });
            normalized.total = DENOMINACIONES.reduce((acc, d) => acc + (normalized.billetes[d] * d), 0);
            normalized.tarjeta = Math.round((parseFloat((entry.tarjeta || entry.tarjeta === 0) ? entry.tarjeta : 0) || 0) * 100) / 100;
            normalized.transferencia = Math.round((parseFloat((entry.transferencia || entry.transferencia === 0) ? entry.transferencia : 0) || 0) * 100) / 100;
            normalized.mercado_pago = Math.round((parseFloat((entry.mercado_pago || entry.mercado_pago === 0) ? entry.mercado_pago : 0) || 0) * 100) / 100;
            return normalized;
          });
        }
        console.log('Datos cargados desde servidor (appData):', appData);
        return;
      }
      throw new Error('Empty server state');
    } catch (err) {
      console.warn('Falling back to localStorage due to:', err);
    }
  }
  
  // Fallback a localStorage
  try {
    const rawData = localStorage.getItem('appData');
    if (rawData) {
      const appData = JSON.parse(rawData);
      clientes = appData.clientes || [];
      productos = appData.productos || [];
      ventas = appData.ventas || [];
      cuentas = appData.cuentas || [];
      cajaMovimientos = appData.cajaMovimientos || [];
      cajaBilletes = appData.cajaBilletes || cajaBilletes;
      cajaBilletesRegistro = appData.cajaBilletesRegistro || cajaBilletesRegistro;
      if (Array.isArray(cajaBilletesRegistro)) {
        cajaBilletesRegistro = cajaBilletesRegistro.map(entry => {
          const normalized = { fecha: entry.fecha, billetes: {}, total: 0 };
          DENOMINACIONES.forEach(d => {
            const val = parseInt((entry.billetes && entry.billetes[d]) || 0) || 0;
            normalized.billetes[d] = val;
          });
          normalized.total = DENOMINACIONES.reduce((acc, d) => acc + (normalized.billetes[d] * d), 0);
          normalized.tarjeta = Math.round((parseFloat((entry.tarjeta || entry.tarjeta === 0) ? entry.tarjeta : 0) || 0) * 100) / 100;
          normalized.transferencia = Math.round((parseFloat((entry.transferencia || entry.transferencia === 0) ? entry.transferencia : 0) || 0) * 100) / 100;
          normalized.mercado_pago = Math.round((parseFloat((entry.mercado_pago || entry.mercado_pago === 0) ? entry.mercado_pago : 0) || 0) * 100) / 100;
          return normalized;
        });
      }
      console.log('Datos cargados desde localStorage (appData):', appData);
    } else {
      clientes = [];
      productos = [];
      ventas = [];
      cuentas = [];
      console.log('No hay datos guardados previos en localStorage');
    }
  } catch (error) {
    console.error('Error cargando datos de localStorage:', error);
    showToast('Error cargando datos locales. Los datos se han reiniciado.', 'error');
    clientes = [];
    productos = [];
    ventas = [];
    cuentas = [];
  }
  
  // ===== ACTUALIZAR LA UI CON LOS DATOS CARGADOS =====
  actualizarListaClientes();
  actualizarListaProductosYStock();
  actualizarListaVentas();
  actualizarResumenCuentas();
  actualizarMovimientosCaja();
  
  // Re-calcular y renderizar caja
  populateCajaDayInputs();
  
  console.log('UI actualizada después de cargar datos');
}

// Elementos del DOM para clientes
const formCliente = document.getElementById('form-cliente');
const inputClienteNombre = document.getElementById('cliente-nombre');
const listaClientes = document.getElementById('lista-clientes');
const ventaClienteSelect = document.getElementById('venta-cliente');
const cuentaClienteSelect = document.getElementById('cuenta-cliente');
const buscarClienteInput = document.getElementById('buscar-cliente');
const limpiarBuscarClientesBtn = document.getElementById('limpiar-buscar-clientes');

// Elementos del DOM para productos
const formProducto = document.getElementById('form-producto');
const inputProductoNombre = document.getElementById('producto-nombre');
const inputProductoPrecio = document.getElementById('producto-precio');
const inputProductoStock = document.getElementById('producto-stock');
const listaProductos = document.getElementById('lista-productos');
const ventaProductoSelect = document.getElementById('venta-producto');
const buscarProductoInput = document.getElementById('buscar-producto');
const limpiarBuscarProductosBtn = document.getElementById('limpiar-buscar-productos');

// Elementos DOM para ventas
const formVenta = document.getElementById('form-venta');
const productosVentaContainer = document.getElementById('productos-venta-container');
const btnAgregarProducto = document.getElementById('btn-agregar-producto');
const inputVentaFecha = document.getElementById('venta-fecha');
const listaVentas = document.getElementById('lista-ventas');

// Split payment elements
const ventaPagoDividido = document.getElementById('venta-pago-dividido');
const ventaPagosDiv = document.getElementById('venta-pagos-divididos');
// legacy (two-part) payment fields removed from the DOM; usage replaced with dynamic parts
const ventaAgregarParteBtn = document.getElementById('venta-agregar-parte');
const ventaListaPagosContainer = document.getElementById('venta-lista-pagos');
const ventaManualAsignacion = document.getElementById('venta-manual-asignacion');

// Utility to generate a unique id for parts
function generatePartId() { return `parte-${Date.now()}-${Math.floor(Math.random() * 10000)}`; }

// Create DOM element for one payment part
function createPaymentPartEl(id, metodo = 'efectivo', monto = '') {
  const wrap = document.createElement('div');
  wrap.className = 'venta-pago-parte';
  wrap.setAttribute('data-id', id);
  wrap.innerHTML = `
    <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">
      <select class="venta-pago-metodo">
        <option value="efectivo">Efectivo</option>
        <option value="tarjeta_credito">Tarjeta — Crédito</option>
        <option value="tarjeta_debito">Tarjeta — Débito</option>
        <option value="transferencia">Transferencia</option>
        <option value="mercado_pago">Mercado Pago</option>
        <option value="qr">QR</option>
      </select>
      <input type="number" class="venta-pago-monto" placeholder="Monto" min="0" step="0.01" style="width:120px" />
      <button type="button" class="btn btn-ghost btn-remove-pago" aria-label="Eliminar parte">Eliminar</button>
    </div>`;
  const sel = wrap.querySelector('.venta-pago-metodo');
  const input = wrap.querySelector('.venta-pago-monto');
  const rm = wrap.querySelector('.btn-remove-pago');
  sel.value = metodo;
  input.value = monto === '' ? '' : String(monto);
  // listeners
  input.addEventListener('input', updateVentaResumen);
  sel.addEventListener('change', updateVentaResumen);
  sel.addEventListener('change', () => renderManualAllocationInputs());
  rm.addEventListener('click', () => {
    wrap.remove();
    updateVentaResumen();
    renderManualAllocationInputs();
  });
  return wrap;
}

// Return current payment parts from DOM
function readPaymentPartsFromDOM() {
  if (!ventaListaPagosContainer) return [];
  const partsEls = Array.from(ventaListaPagosContainer.querySelectorAll('.venta-pago-parte'));
  return partsEls.map(el => ({
    metodo: el.querySelector('.venta-pago-metodo').value,
    monto: Math.round((parseFloat(el.querySelector('.venta-pago-monto').value) || 0) * 100) / 100
  }));
}

function ensureAtLeastOnePayment() {
  if (!ventaListaPagosContainer) return;
  if (ventaListaPagosContainer.querySelectorAll('.venta-pago-parte').length === 0) {
    // create two default parts to help users
    addPaymentPart('efectivo', '0');
    addPaymentPart('tarjeta_credito', '0');
  }
}

function addPaymentPart(metodo = 'efectivo', monto = '') {
  if (!ventaListaPagosContainer) return;
  const el = createPaymentPartEl(generatePartId(), metodo, monto);
  ventaListaPagosContainer.appendChild(el);
  updateVentaResumen();
  renderManualAllocationInputs();
  return el;
}

// Render or remove per-product manual allocation inputs depending on toggle
function renderManualAllocationInputs() {
  const enabled = ventaManualAsignacion && ventaManualAsignacion.checked;
  const parts = readPaymentPartsFromDOM();
  const rows = document.querySelectorAll('.producto-venta-item');
  rows.forEach((row, prodIndex) => {
    let asignWrap = row.querySelector('.producto-venta-asignacion');
    if (enabled && !asignWrap) {
      asignWrap = document.createElement('div');
      asignWrap.className = 'producto-venta-asignacion';
      asignWrap.setAttribute('aria-hidden', 'false');
      row.appendChild(asignWrap);
    }
    if (!enabled && asignWrap) {
      asignWrap.remove();
    }
    if (enabled && asignWrap) {
      // ensure inputs for each part
      asignWrap.innerHTML = '';
      parts.forEach((p, pIdx) => {
        const label = document.createElement('label');
        label.className = 'sr-only';
        label.textContent = `Pago ${pIdx + 1}`;
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'producto-asignacion-input';
        input.setAttribute('data-part-index', String(pIdx));
        input.setAttribute('data-prod-index', String(prodIndex));
        input.placeholder = `${p.metodo} monto`;
        input.min = '0';
        input.step = '0.01';
        input.addEventListener('input', updateVentaResumen);
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.gap = '.4rem';
        container.style.alignItems = 'center';
        container.innerHTML = `<span class="small muted">${p.metodo}:</span>`;
        container.appendChild(input);
        asignWrap.appendChild(container);
      });
    }
  });
}

// read manual allocations mapping returns: { perProduct: [{partIdx->amount...}], perPartTotals: [..] }
function readManualAllocations() {
  const result = { perProduct: [], perPartTotals: [] };
  const parts = readPaymentPartsFromDOM();
  result.perPartTotals = parts.map(() => 0);
  const rows = document.querySelectorAll('.producto-venta-item');
  rows.forEach((row, prodIndex) => {
    const subtotal = (() => { const select = row.querySelector('.venta-producto'); const qty = parseInt(row.querySelector('.venta-cantidad').value) || 0; if (!select || select.value === '') return 0; const prod = productos[parseInt(select.value)]; return prod ? (prod.precio * qty) : 0; })();
    const obj = { subtotal, parts: [] };
    for (let i = 0; i < parts.length; i++) obj.parts[i] = 0;
    const inputs = row.querySelectorAll('.producto-asignacion-input');
    inputs.forEach(inp => {
      const idx = parseInt(inp.getAttribute('data-part-index')) || 0;
      const amt = Math.round((parseFloat(inp.value) || 0) * 100) / 100;
      obj.parts[idx] = amt;
      result.perPartTotals[idx] = Math.round(((result.perPartTotals[idx] || 0) + amt) * 100) / 100;
    });
    result.perProduct.push(obj);
  });
  return result;
}

// Elementos DOM para stock
const listaStock = document.getElementById('lista-stock');

// Elementos DOM para cuentas corrientes
const formCuenta = document.getElementById('form-cuenta');
const inputCuentaMonto = document.getElementById('cuenta-monto');
const selectTipoCuenta = document.getElementById('cuenta-tipo');
const resumenCuentasDiv = document.getElementById('resumen-cuentas');
const cuentaProductoSelect = document.getElementById('cuenta-producto');
const cuentaProductoCantidad = document.getElementById('cuenta-producto-cantidad');
const inputCuentaNombre = document.getElementById('cuenta-nombre');

function updateCuentaMontoFromProduct() {
  if (!cuentaProductoSelect || !inputCuentaMonto) return;
  const prodVal = cuentaProductoSelect.value;
  if (prodVal !== '') {
    const idx = parseInt(prodVal);
    const qty = Math.max(1, parseInt(cuentaProductoCantidad.value) || 1);
    const prod = productos[idx];
    if (prod) {
      const computed = Math.round((prod.precio * qty) * 100) / 100;
      inputCuentaMonto.value = computed.toFixed(2);
      inputCuentaMonto.setAttribute('readonly', 'true');
      inputCuentaMonto.classList.add('readonly-computed');
      return;
    }
  }
  // if no product selected, allow manual input
  inputCuentaMonto.removeAttribute('readonly');
  inputCuentaMonto.classList.remove('readonly-computed');
}
// Elementos DOM para movimiento de caja
const formCaja = document.getElementById('form-caja');
const inputCajaMonto = document.getElementById('caja-monto');
const inputCajaMotivo = document.getElementById('caja-motivo');
const cajaTotalDiv = document.getElementById('caja-total');
const movimientosCajaDiv = document.getElementById('movimientos-caja');

// Funciones para renderizar UI

function actualizarListaProductosYStock() {
  const cont = document.getElementById('lista-productos-stock');
    if (!cont || productos.length === 0) {
      if (cont) cont.innerHTML = emptyStateHTML('No hay productos registrados');
    if (ventaProductoSelect) ventaProductoSelect.innerHTML = '<option value="">Seleccione Producto</option>';
    return;
  }

  const html = productos.map((producto, index) => {
    return `<div class="producto-item" tabindex="0" role="group" aria-label="Producto ${producto.nombre} (fila ${index + 1})">
      <input type="text" value="${producto.nombre}" data-index="${index}" class="input-nombre-producto" placeholder="Tipo de producto" aria-label="Nombre del producto ${producto.nombre}" />
      <label class="sr-only" for="producto-codigo-${index}">Código de barras</label>
      <input type="text" value="${producto.codigoBarra || ''}" data-index="${index}" id="producto-codigo-${index}" class="input-codigo-barra" placeholder="Código de barras (opcional)" aria-label="Código de barras del producto ${producto.nombre}" />
      ${producto.codigoEspecial ? `
        <div class="small muted" style="margin-left:.5rem;display:flex;gap:.35rem;align-items:center;">
          <label class="sr-only" for="producto-codigo-especial-${index}">Código especial</label>
          <input id="producto-codigo-especial-${index}" class="input-codigo-especial" readonly value="${producto.codigoEspecial}" data-index="${index}" style="width:9.5rem;font-size:.85rem;padding:.25rem;" aria-label="Código especial del producto ${producto.nombre}" />
          <button class="btn btn-ghost btn-copy-codigo-especial" data-index="${index}" aria-label="Copiar código especial" title="Copiar código especial">
            <svg class="icon" width="14" height="14" aria-hidden="true"><use href="#icon-copy"></use></svg>
          </button>
        </div>
      ` : `<button class="btn btn-ghost btn-gen-codigo-especial" data-index="${index}" style="margin-left:.5rem">Generar código especial</button>`}
      <span>Precio:</span>
      <input type="number" min="0" step="0.01" value="${producto.precio.toFixed(2)}" data-index="${index}" class="input-precio" aria-label="Precio del producto ${producto.nombre}" />
      <span>Stock:</span>
      <input type="number" min="0" step="1" value="${producto.stock}" data-index="${index}" class="input-stock" aria-label="Stock del producto ${producto.nombre}" />
      <button class="btn-guardar-stock-precio" data-index="${index}">Guardar</button>
      <button class="btn-eliminar-producto" data-index="${index}" title="Eliminar Producto">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M3 6h18M8 6v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6m-9 0V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/>
        </svg>
      </button>
    </div>`;
  }).join('');

  cont.innerHTML = html;

  const options = productos.map((producto, index) => `<option value="${index}">${producto.nombre}</option>`).join('');
  if (ventaProductoSelect) ventaProductoSelect.innerHTML = '<option value="">Seleccione Producto</option>' + options;
  // Populate cuenta-producto if present
  const cuentaProd = document.getElementById('cuenta-producto');
  if (cuentaProd) cuentaProd.innerHTML = '<option value="">Sin producto</option>' + options;

  // Update all product selects in the sales form
  const allVentaProductoSelects = document.querySelectorAll('.venta-producto');
  allVentaProductoSelects.forEach(select => {
    select.innerHTML = '<option value="">Seleccione Producto</option>' + options;
  });

  agregarListenersGuardarStockPrecio();
  agregarListenersGuardarNombreProducto();
  agregarListenersGuardarCodigoBarra();

  // Add listeners for delete buttons (ask confirmation)
  const deleteButtons = document.querySelectorAll('.btn-eliminar-producto');
  deleteButtons.forEach(button => {
    button.removeEventListener('click', () => {});
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      const idx = parseInt(event.currentTarget.getAttribute('data-index'));
      if (isNaN(idx) || idx < 0 || idx >= productos.length) return showToast('Índice inválido', 'error');

      const name = productos[idx] ? productos[idx].nombre : 'producto';
      const ok = await showConfirm(`¿Eliminar el producto "${name}"? Esta acción no se puede deshacer.`, { okLabel: 'Eliminar', cancelLabel: 'Cancelar' });
      if (!ok) return;
      // snapshot state so it can be restored if user undoes
      const snapshot = JSON.stringify({ clientes, productos, ventas, cuentas });
      const undoId = pushUndoSnapshot(`Producto: ${name}`, snapshot);

      // perform deletion
      productos.splice(idx, 1);
      // update caja after removing product and potential related ventas
      ventas = ventas.filter(v => v.producto !== idx);
      ventas = ventas.map(v => ({ ...v, producto: v.producto > idx ? v.producto - 1 : v.producto }));

      saveAppData();
      actualizarListaProductosYStock();
      actualizarListaVentas();
      actualizarMovimientosCaja();
      actualizarResumenCuentas();
      actualizarHistorial();
      // show undo-capable toast
      showToast('Producto eliminado', 'success', 6000, {
        label: 'Deshacer',
        callback: () => {
          try {
            const state = JSON.parse(snapshot);
            clientes = state.clientes || [];
            productos = state.productos || [];
            ventas = state.ventas || [];
            cuentas = state.cuentas || [];
            saveAppData();
            actualizarListaProductosYStock();
            actualizarListaVentas();
            actualizarResumenCuentas();
            actualizarHistorial();
            updateVentaResumen();
            // remove from undo history (it was handled)
            removeUndoById(undoId);
            showToast('Eliminación deshecha', 'success');
          } catch (err) { console.error('Error al deshacer producto', err); showToast('No fue posible deshacer', 'error'); }
        }
      });
      updateVentaResumen();
    });
  });

  // Attach listeners for generate special code buttons
  const genBtns = document.querySelectorAll('.btn-gen-codigo-especial');
  genBtns.forEach(btn => {
    btn.removeEventListener('click', () => {});
    btn.addEventListener('click', (e) => {
      const idx = parseInt(btn.getAttribute('data-index'));
      if (isNaN(idx) || idx < 0 || idx >= productos.length) return showToast('Índice inválido', 'error');
      if (!productos[idx].codigoEspecial) productos[idx].codigoEspecial = generateUniqueSpecialCode();
      saveAppData();
      showToast(`Código especial generado: ${productos[idx].codigoEspecial}`, 'success');
      actualizarListaProductosYStock();
    });
  });

  // Attach copy handlers for special-code copy buttons and select-on-focus for inputs
  const copyBtns = document.querySelectorAll('.btn-copy-codigo-especial');
  copyBtns.forEach(btn => {
    btn.removeEventListener('click', () => {});
    btn.addEventListener('click', (e) => {
      const idx = parseInt(btn.getAttribute('data-index'));
      if (isNaN(idx) || idx < 0 || idx >= productos.length) return showToast('Índice inválido', 'error');
      const code = productos[idx].codigoEspecial;
      if (!code) return showToast('No hay código para copiar', 'error');
      // visually show a check state if copy succeeds
      const originalContent = btn.innerHTML;
      copyToClipboard(code).then(() => {
        try {
          btn.setAttribute('aria-label', 'Copiado');
          btn.classList.add('copied');
          btn.innerHTML = `<svg class="icon" width="14" height="14" aria-hidden="true"><use href="#icon-check"></use></svg>`;
          setTimeout(() => {
            btn.classList.remove('copied');
            btn.setAttribute('aria-label', 'Copiar código especial');
            btn.innerHTML = originalContent;
          }, 1400);
        } catch (err) { /* ignore UI revert errors */ }
      }).catch(() => {
        // copyToClipboard already shows a toast on failure
      });
    });
  });

  const specialInputs = document.querySelectorAll('.input-codigo-especial');
  specialInputs.forEach(inp => {
    inp.removeEventListener('focus', () => {});
    inp.addEventListener('focus', (e) => e.target.select());
  });
}

function agregarListenersGuardarCodigoBarra() {
  const inputsCodigo = document.querySelectorAll('.input-codigo-barra');
  inputsCodigo.forEach(input => {
    input.removeEventListener('change', () => {});
    input.addEventListener('change', (event) => {
      const idx = parseInt(event.target.getAttribute('data-index'));
      if (isNaN(idx) || idx < 0 || idx >= productos.length) {
        showToast('Índice de producto inválido para código de barras', 'error');
        return;
      }
      const nuevo = event.target.value.trim();
      // prevent duplicates
      const clash = productos.findIndex((p, i) => i !== idx && p.codigoBarra && p.codigoBarra === nuevo);
      if (nuevo !== '' && clash !== -1) {
        showToast('Este código de barras ya está asignado a otro producto', 'error');
        // revert
        event.target.value = productos[idx].codigoBarra || '';
        return;
      }
      productos[idx].codigoBarra = nuevo === '' ? undefined : nuevo;
      // if barcode is set now, remove any special code
      if (productos[idx].codigoBarra) delete productos[idx].codigoEspecial;
      // if barcode cleared and no special code exists, generate one
      if (!productos[idx].codigoBarra && !productos[idx].codigoEspecial) {
        productos[idx].codigoEspecial = generateUniqueSpecialCode();
      }
      saveAppData();
      showToast('Código de barras guardado', 'success');
      actualizarListaProductosYStock();
    });
  });
}

/* Renderiza la lista de clientes con estilo moderno y controles accesibles */
function actualizarListaClientes() {
  const cont = listaClientes;
  if (!cont) return;

  if (clientes.length === 0) {
    cont.innerHTML = emptyStateHTML('No hay clientes registrados');
    // Clear selects
    if (ventaClienteSelect) ventaClienteSelect.innerHTML = '<option value="">Seleccione Cliente</option>';
    if (cuentaClienteSelect) cuentaClienteSelect.innerHTML = '<option value="">Seleccione Cliente</option>';
    return;
  }

  // Build client options for selects
  const options = clientes.map((c, idx) => `<option value="${idx}">${c.nombre}</option>`).join('');
  if (ventaClienteSelect) ventaClienteSelect.innerHTML = '<option value="">Seleccione Cliente</option>' + options;
  if (cuentaClienteSelect) cuentaClienteSelect.innerHTML = '<option value="">Seleccione Cliente</option>' + options;

  // Render list items
  const html = clientes.map((cliente, index) => {
    return `
      <div class="list-item" data-index="${index}" tabindex="0" role="listitem" aria-label="Cliente ${cliente.nombre}">
        <div style="display:flex;flex-direction:column;gap:.1rem;">
          <strong>${cliente.nombre}</strong>
          <span class="small muted">ID: ${index + 1}</span>
        </div>
        <div style="display:flex;gap:.45rem;align-items:center;">
          <button class="btn btn-ghost select-client" data-index="${index}" aria-label="Seleccionar cliente"><svg class="icon" width="14" height="14" aria-hidden="true"><use href="#icon-search"></use></svg>Seleccionar</button>
          <button class="btn btn-danger delete-client" data-index="${index}" aria-label="Eliminar cliente"><svg class="icon" width="14" height="14" aria-hidden="true"><use href="#icon-delete"></use></svg>Eliminar</button>
        </div>
      </div>`;
  }).join('');

  cont.innerHTML = html;

  // Attach listeners
  const selects = cont.querySelectorAll('.select-client');
  selects.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(btn.getAttribute('data-index'));
      if (isNaN(idx)) return showToast('Índice inválido', 'error');
      if (cuentaClienteSelect) cuentaClienteSelect.value = idx;
      showToast(`Cliente ${clientes[idx].nombre} seleccionado`, 'success');
      showClientDetails(idx);
    });
  });

  const dels = cont.querySelectorAll('.delete-client');
  dels.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const idx = parseInt(btn.getAttribute('data-index'));
      if (isNaN(idx) || idx < 0 || idx >= clientes.length) return showToast('Índice inválido', 'error');
      const name = clientes[idx].nombre || 'cliente';
      const ok = await showConfirm(`¿Eliminar al cliente "${name}"? Se eliminarán también ventas y movimientos asociados.`, { okLabel: 'Eliminar', cancelLabel: 'Cancelar' });
      if (!ok) return;

      // snapshot current state to allow undo
      const snapshot = JSON.stringify({ clientes, productos, ventas, cuentas });
      const undoId = pushUndoSnapshot(`Cliente: ${name}`, snapshot);

      // Remove client and clean up references in ventas and cuentas
      clientes.splice(idx, 1);

      // Remove ventas that referenced the deleted client
      ventas = ventas.filter(v => v.cliente !== idx);
      // Decrement client index in remaining ventas
      ventas = ventas.map(v => ({ ...v, cliente: v.cliente > idx ? v.cliente - 1 : v.cliente }));

      // Remove cuentas referencing deleted client and shift indexes
      cuentas = cuentas.filter(c => c.cliente !== idx);
      cuentas = cuentas.map(c => ({ ...c, cliente: c.cliente > idx ? c.cliente - 1 : c.cliente }));

      saveAppData();
      actualizarListaClientes();
      actualizarListaVentas();
      actualizarMovimientosCaja();
      actualizarResumenCuentas();
      actualizarHistorial();
      // show undo-capable toast
      showToast('Cliente eliminado', 'success', 6000, {
        label: 'Deshacer',
        callback: () => {
          try {
            const state = JSON.parse(snapshot);
            clientes = state.clientes || [];
            productos = state.productos || [];
            ventas = state.ventas || [];
            cuentas = state.cuentas || [];
            saveAppData();
            actualizarListaClientes();
            actualizarListaVentas();
            actualizarResumenCuentas();
            actualizarHistorial();
            showToast('Eliminación deshecha', 'success');
            removeUndoById(undoId);
          } catch (err) { console.error('Error al deshacer cliente', err); showToast('No fue posible deshacer', 'error'); }
        }
      });
    });
  });

  // keyboard support for rows (Enter/Space to select)
  const allRows = cont.querySelectorAll('.list-item');
  allRows.forEach(row => {
    row.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        const idx = parseInt(row.getAttribute('data-index'));
        if (!isNaN(idx)) {
          if (cuentaClienteSelect) cuentaClienteSelect.value = idx;
          showToast(`Cliente ${clientes[idx].nombre} seleccionado`, 'success');
          showClientDetails(idx);
        }
      }
    });
  });
}

/* Simple client search that filters the client list and keeps selects in sync */
function filterClientes(q) {
  const query = (q || '').toLowerCase().trim();
  if (!listaClientes) return;
  if (!query) return actualizarListaClientes();

  const results = clientes.map((c, idx) => ({ c, idx })).filter(({c}) => c.nombre.toLowerCase().includes(query));
  if (results.length === 0) {
    listaClientes.innerHTML = emptyStateHTML('No se encontraron clientes');
    // update selects to show nothing
    if (ventaClienteSelect) ventaClienteSelect.innerHTML = '<option value="">Seleccione Cliente</option>';
    if (cuentaClienteSelect) cuentaClienteSelect.innerHTML = '<option value="">Seleccione Cliente</option>';
    return;
  }

  // Update selects & preserve values
  const options = results.map(r => `<option value="${r.idx}">${r.c.nombre}</option>`).join('');
  if (ventaClienteSelect) ventaClienteSelect.innerHTML = '<option value="">Seleccione Cliente</option>' + options;
  if (cuentaClienteSelect) cuentaClienteSelect.innerHTML = '<option value="">Seleccione Cliente</option>' + options;

  // render results in list area
  listaClientes.innerHTML = results.map(r => `
    <div class="list-item" data-index="${r.idx}" tabindex="0" role="listitem" aria-label="Cliente ${r.c.nombre}">
      <div style="display:flex;flex-direction:column;gap:.1rem;">
        <strong>${r.c.nombre}</strong>
        <span class="small muted">ID: ${r.idx + 1}</span>
      </div>
      <div style="display:flex;gap:.45rem;align-items:center;">
        <button class="btn btn-ghost select-client" data-index="${r.idx}" aria-label="Seleccionar cliente"><svg class="icon" width="14" height="14" aria-hidden="true"><use href="#icon-search"></use></svg>Seleccionar</button>
        <button class="btn btn-danger delete-client" data-index="${r.idx}" aria-label="Eliminar cliente"><svg class="icon" width="14" height="14" aria-hidden="true"><use href="#icon-delete"></use></svg>Eliminar</button>
      </div>
    </div>`).join('');

  // Re-attach listeners for the filtered rendering
  listaClientes.querySelectorAll('.select-client').forEach(b => b.addEventListener('click', (e) => {
    const idx = parseInt(b.getAttribute('data-index'));
    if (!isNaN(idx)) {
      if (ventaClienteSelect) ventaClienteSelect.value = idx;
      if (cuentaClienteSelect) cuentaClienteSelect.value = idx;
      showToast(`Cliente ${clientes[idx].nombre} seleccionado`, 'success');
      showClientDetails(idx);
    }
  }));

  listaClientes.querySelectorAll('.delete-client').forEach(b => b.addEventListener('click', async (e) => {
    const idx = parseInt(b.getAttribute('data-index'));
    if (isNaN(idx)) return showToast('Índice inválido', 'error');
    const ok = await showConfirm(`¿Eliminar al cliente "${clientes[idx].nombre}"?`);
    if (!ok) return;
    const snapshot = JSON.stringify({ clientes, productos, ventas, cuentas });
    const undoId = pushUndoSnapshot(`Cliente: ${clientes[idx] ? clientes[idx].nombre : 'cliente'}`, snapshot);
    clientes.splice(idx, 1);
    // normalize ventas & cuentas similar to full delete
    ventas = ventas.filter(v => v.cliente !== idx);
    ventas = ventas.map(v => ({ ...v, cliente: v.cliente > idx ? v.cliente - 1 : v.cliente }));
    cuentas = cuentas.filter(c => c.cliente !== idx);
    cuentas = cuentas.map(c => ({ ...c, cliente: c.cliente > idx ? c.cliente - 1 : c.cliente }));
    saveAppData();
    actualizarListaClientes();
    actualizarResumenCuentas();
    actualizarHistorial();
    showToast('Cliente eliminado', 'success', 6000, {
      label: 'Deshacer',
      callback: () => {
        try {
          const state = JSON.parse(snapshot);
          clientes = state.clientes || [];
          productos = state.productos || [];
          ventas = state.ventas || [];
          cuentas = state.cuentas || [];
          saveAppData();
          actualizarListaClientes();
          actualizarResumenCuentas();
          actualizarHistorial();
          showToast('Eliminación deshecha', 'success');
          removeUndoById(undoId);
        } catch (err) { console.error('Error al deshacer cliente filtrado', err); showToast('No fue posible deshacer', 'error'); }
      }
    });
  }));

  // keyboard support for filtered rows (Enter/Space to select)
  const filteredRows = listaClientes.querySelectorAll('.list-item');
  filteredRows.forEach(row => {
    row.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        const idx = parseInt(row.getAttribute('data-index'));
        if (!isNaN(idx)) {
          if (ventaClienteSelect) ventaClienteSelect.value = idx;
          if (cuentaClienteSelect) cuentaClienteSelect.value = idx;
          showToast(`Cliente ${clientes[idx].nombre} seleccionado`, 'success');
        }
      }
    });
  });
}


function filterProductos(q) {
  const query = (q || '').toLowerCase().trim();
  const cont = document.getElementById('lista-productos-stock');
  if (!cont) return;
  const results = productos.map((p, idx) => ({ p, idx })).filter(({p}) => p.nombre.toLowerCase().includes(query));
  if (results.length === 0) {
    cont.innerHTML = '<p>No se encontraron productos</p>';
  } else {
    // render full product card for matches
    cont.innerHTML = results.map(r => `<div class="producto-item" tabindex="0" role="group" aria-label="Producto ${r.p.nombre}">${r.p.nombre} — Precio: $${r.p.precio.toFixed(2)} — Stock: ${r.p.stock}</div>`).join('');
  }

  // update all product selects in the sales form to show filtered options, keeping selected values
  const allVentaProductoSelects = document.querySelectorAll('.venta-producto');
  allVentaProductoSelects.forEach(select => {
    const current = select.value;
    const options = results.map(r => `<option value="${r.idx}">${r.p.nombre}</option>`).join('');
    select.innerHTML = '<option value="">Seleccione Producto</option>' + options;
    // restore current selection explicitly if present, otherwise append missing option and keep selection
    if (current !== '') {
      if (Array.from(select.options).some(o => o.value === current)) {
        select.value = current;
      } else {
        const prod = productos[current];
        if (prod) {
          const option = document.createElement('option');
          option.value = current;
          option.text = prod.nombre + ' (seleccionado)';
          select.appendChild(option);
          select.value = current;
        } else {
          select.value = '';
        }
      }
    }
  });
}

// ---------- Venta search helpers (search by name or code and quick-select) ----------
function searchProductsForVenta(q) {
  const query = (q || '').toLowerCase().trim();
  if (!query) return [];
  const results = productos.map((p, idx) => ({ p, idx })).filter(({p}) => {
    return p.nombre.toLowerCase().includes(query) || (p.codigoBarra && p.codigoBarra.includes(query)) || (p.codigoEspecial && p.codigoEspecial.includes(query));
  });
  return results.slice(0, 10);
}

function renderVentaSearchSuggestions(results) {
  const cont = document.getElementById('venta-search-suggestions');
  if (!cont) return;
  if (!results || results.length === 0) { cont.innerHTML = ''; return; }
  cont.innerHTML = results.map(r => `<div class="suggestion-item" role="option" data-idx="${r.idx}"><div>${escapeHtml(r.p.nombre)}</div><div class="code">${r.p.codigoBarra || r.p.codigoEspecial || ''}</div></div>`).join('');
  // attach handlers
  cont.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = item.getAttribute('data-idx');
      selectProductForVenta(idx);
      const input = document.getElementById('venta-buscar-producto'); if (input) { input.value = ''; }
      clearVentaSearchSuggestions();
    });
  });
}

function clearVentaSearchSuggestions() {
  const cont = document.getElementById('venta-search-suggestions'); if (cont) cont.innerHTML = '';
}

function selectProductForVenta(idx) {
  if (idx === undefined || idx === null) return;
  // ensure there's at least one row
  if (!document.querySelector('.producto-venta-item')) {
    agregarProductoVenta();
  }
  // find the last product select and set it
  let selects = document.querySelectorAll('.venta-producto');
  let target = selects[selects.length - 1];
  if (!target) return;
  // if the last row already has a product selected, add a new row so we append instead of replacing
  if (target.value && target.value !== '') {
    agregarProductoVenta();
    selects = document.querySelectorAll('.venta-producto');
    target = selects[selects.length - 1];
  }
  // set the selection and trigger change
  target.value = String(idx);
  target.dispatchEvent(new Event('change', { bubbles: true }));
  // focus quantity input in that row
  const lastRow = target.closest('.producto-venta-item');
  const qty = lastRow ? lastRow.querySelector('.venta-cantidad') : null;
  if (qty) { qty.value = '1'; qty.focus(); qty.dispatchEvent(new Event('input')); }
  // update summary
  updateVentaResumen();
}



function agregarListenersGuardarNombreProducto() {
  const inputsNombre = document.querySelectorAll('.input-nombre-producto');
  inputsNombre.forEach(input => {
    input.addEventListener('change', (event) => {
      const idx = parseInt(event.target.getAttribute('data-index'));
      if (isNaN(idx) || idx < 0 || idx >= productos.length) {
        showToast('Índice de producto inválido para nombre', 'error');
        return;
      }
      const nuevoNombre = event.target.value.trim();
      if (nuevoNombre === '') {
        showToast('El nombre del producto no puede estar vacío', 'error');
        event.target.value = productos[idx].nombre;
        return;
      }
      productos[idx].nombre = nuevoNombre;
      saveAppData();
      actualizarListaProductosYStock();
      actualizarHistorial();
    });
  });
}

function agregarListenersGuardarStockPrecio() {
  const buttons = document.querySelectorAll('.btn-guardar-stock-precio');
  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const idx = parseInt(button.getAttribute('data-index'));
      if (isNaN(idx) || idx < 0 || idx >= productos.length) {
        showToast('Índice de producto inválido', 'error');
        return;
      }
      // Get the corresponding inputs for price and stock
      const inputPrecio = document.querySelector(`input.input-precio[data-index="${idx}"]`);
      const inputStock = document.querySelector(`input.input-stock[data-index="${idx}"]`);
      if (!inputPrecio || !inputStock) {
        showToast('Inputs no encontrados para el producto', 'error');
        return;
      }
      const nuevoPrecio = parseFloat(inputPrecio.value);
      const nuevoStock = parseInt(inputStock.value);
      if (isNaN(nuevoPrecio) || nuevoPrecio < 0) {
        showToast('Ingrese un precio válido mayor o igual a 0', 'error');
        inputPrecio.value = productos[idx].precio.toFixed(2);
        return;
      }
      if (isNaN(nuevoStock) || nuevoStock < 0) {
        showToast('Ingrese un stock válido mayor o igual a 0', 'error');
        inputStock.value = productos[idx].stock;
        return;
      }
      // Save the changes
      productos[idx].precio = nuevoPrecio;
      productos[idx].stock = nuevoStock;
      actualizarListaProductosYStock();
      actualizarListaVentas();
      saveAppData();
      actualizarHistorial();
      showToast('Producto actualizado correctamente.', 'success');
      updateVentaResumen();
    });
  });
}

function actualizarStock() {
  if(productos.length === 0) {
    document.getElementById('lista-productos-stock').innerHTML = emptyStateHTML('No hay productos en stock');
    return;
  }
}

function actualizarListaVentas() {
  if (!listaVentas) return; // ventas list removed from the Ventas section; keep function safe
  if(ventas.length === 0) {
    listaVentas.innerHTML = emptyStateHTML('No hay ventas registradas');
    return;
  }

  // Agrupar ventas por fecha
  const ventasPorDia = {};
  ventas.forEach((venta, index) => {
    const fecha = venta.fecha;
    if (!ventasPorDia[fecha]) {
      ventasPorDia[fecha] = [];
    }
    ventasPorDia[fecha].push({ ...venta, index });
  });

  // Ordenar fechas
  const fechasOrdenadas = Object.keys(ventasPorDia).sort();

  let html = '';
  let totalVentasGlobal = 0;
  let totalProductosGlobal = 0;
  let totalMontoGlobal = 0;
  fechasOrdenadas.forEach(fecha => {
    const ventasDia = ventasPorDia[fecha];
    let totalProductos = 0;
    let totalMonto = 0;
    const ventasHtml = ventasDia.map(venta => {
      const clienteNombre = (venta.cliente !== undefined && venta.cliente !== null && clientes[venta.cliente]) ? clientes[venta.cliente].nombre : '(Sin cliente)';
      const productoNombre = productos[venta.producto].nombre;
      const precio = productos[venta.producto].precio;
      const monto = precio * venta.cantidad;
      totalProductos += venta.cantidad;
      totalMonto += monto;
      let metodoPago = 'No especificado';
      if (venta.pagos && Array.isArray(venta.pagos) && venta.pagos.length > 0) {
        metodoPago = venta.pagos.map(p => `${escapeHtml(p.metodo)}: $${(parseFloat(p.monto)||0).toFixed(2)}`).join(' - ');
      } else if (venta.metodoPago) {
        metodoPago = escapeHtml(venta.metodoPago);
      }
      return `<div style="margin-left: 20px;">Venta #${venta.index + 1}: Cliente ${clienteNombre} - Producto ${productoNombre} - Cantidad: ${venta.cantidad} - Monto: $${monto.toFixed(2)} - Método de Pago: ${metodoPago}</div>`;
    }).join('');
    html += `<div><strong>Día: ${fecha}</strong> - Total ventas: ${ventasDia.length} - Total productos vendidos: ${totalProductos} - Monto total: $${totalMonto.toFixed(2)}${ventasHtml}</div>`;
    totalVentasGlobal += ventasDia.length;
    totalProductosGlobal += totalProductos;
    totalMontoGlobal += totalMonto;
  });

  html += `<div style="margin-top: 20px; font-weight: bold; border-top: 1px solid #ccc; padding-top: 10px;">Total General - Ventas totales: ${totalVentasGlobal} - Productos vendidos: ${totalProductosGlobal} - Monto total: $${totalMontoGlobal.toFixed(2)}</div>`;

  listaVentas.innerHTML = html;
}

function actualizarResumenCuentas() {
  if(clientes.length === 0) {
    resumenCuentasDiv.innerHTML = emptyStateHTML('No hay clientes para mostrar cuentas corrientes');
    return;
  }
  let html = '';
  clientes.forEach((cliente, index) => {
    const movimientos = cuentas
      .map((c, idx) => ({ ...c, idx })) // add original index for deletion
      .filter(c => c.cliente === index);
    if(movimientos.length === 0) {
      html += `<div><strong>${cliente.nombre}</strong>: <span class="small muted">No hay movimientos</span></div>`;
      return;
    }

    let saldo = 0;
    const movimientosHtml = movimientos.map(mov => {
      saldo += mov.tipo === 'cargo' ? mov.monto : -mov.monto;
      let prodInfo = '';
      if (mov.producto !== undefined && mov.producto !== null && productos[mov.producto]) {
        const p = productos[mov.producto];
        prodInfo = ` — Producto: ${p.nombre} x${mov.cantidad} — Monto: $${(mov.monto||0).toFixed(2)}`;
      }
      return `<div style="margin-left: 20px;">
        ${mov.tipo.toUpperCase()}: $${mov.monto.toFixed(2)} ${prodInfo}
        <button class="btn-eliminar-mov" data-idx="${mov.idx}" style="margin-left:10px;">Eliminar</button>
      </div>`;
    }).join('');

    // Aggregate owed products for this client (only cargos tied to products)
    const owedProducts = {};
    movimientos.forEach(mov => {
      if (mov.tipo === 'cargo' && mov.producto !== undefined && mov.producto !== null) {
        const pid = mov.producto;
        owedProducts[pid] = owedProducts[pid] || { qty: 0, amount: 0 };
        owedProducts[pid].qty += (mov.cantidad || 0);
        owedProducts[pid].amount += (mov.monto || 0);
      }
    });
    let owedHtml = '';
    const owedKeys = Object.keys(owedProducts);
    if (owedKeys.length > 0) {
      owedHtml = '<div style="margin-left:20px;margin-top:6px"><strong><span class="badge owed-badge"><svg class="icon small" aria-hidden="true"><use href="#icon-receipt"></use></svg>Adeuda</span>Productos adeudados:</strong> ' + owedKeys.map(k => {
        const p = productos[k] || { nombre: `(Producto ${k})` };
        const o = owedProducts[k];
        return `${escapeHtml(p.nombre)} x${o.qty} ($${o.amount.toFixed(2)})`;
      }).join(' • ') + '</div>';
    }
    html += `
      <div>
        <strong>${cliente.nombre}</strong>: <em>Saldo: $${saldo.toFixed(2)}</em>
        ${movimientosHtml}
        ${owedHtml}
      </div>`;
  });
  resumenCuentasDiv.innerHTML = html;

  // Add listeners for delete buttons
  const buttons = resumenCuentasDiv.querySelectorAll('.btn-eliminar-mov');
  buttons.forEach(button => {
    button.addEventListener('click', async () => {
      const idx = parseInt(button.getAttribute('data-idx'));
      if (isNaN(idx)) return showToast('Índice inválido', 'error');
      const mov = cuentas[idx];
      const clienteNombre = clientes[mov.cliente] ? clientes[mov.cliente].nombre : 'Desconocido';
      const ok = await showConfirm(`¿Eliminar movimiento #${idx + 1} de ${clienteNombre}? Esta acción no se puede deshacer.`, { okLabel: 'Eliminar', cancelLabel: 'Cancelar' });
      if (!ok) return;

      // snapshot before deleting so it can be undone
      const snapshot = JSON.stringify({ clientes, productos, ventas, cuentas });
      const undoId = pushUndoSnapshot(`Movimiento: ${clienteNombre} $${mov.monto.toFixed(2)}`, snapshot);
      // If movement was a cargo tied to a product, restore stock when deleting
      if (mov.tipo === 'cargo' && mov.producto !== undefined && mov.producto !== null && productos[mov.producto]) {
        productos[mov.producto].stock = (productos[mov.producto].stock || 0) + (mov.cantidad || 0);
      }
      cuentas.splice(idx, 1);
      saveAppData();
      actualizarResumenCuentas();
      actualizarHistorial();
      showToast('Movimiento eliminado', 'success', 6000, {
        label: 'Deshacer',
        callback: () => {
          try {
            const state = JSON.parse(snapshot);
            clientes = state.clientes || [];
            productos = state.productos || [];
            ventas = state.ventas || [];
            cuentas = state.cuentas || [];
            saveAppData();
            actualizarResumenCuentas();
            actualizarHistorial();
            showToast('Movimiento restaurado', 'success');
            removeUndoById(undoId);
          } catch (err) { console.error('Error al deshacer movimiento', err); showToast('No fue posible deshacer', 'error'); }
        }
      });
    });
  });
}

// Show detailed resumen for a specific client (index)
function showClientDetails(index) {
  if (index === '' || index === null || index === undefined) return;
  const idx = parseInt(index);
  if (isNaN(idx) || idx < 0 || idx >= clientes.length) return;
  const cliente = clientes[idx];
  const movimientos = cuentas
    .map((c, i) => ({ ...c, idx: i }))
    .filter(c => c.cliente === idx);

  let saldo = 0;
  const movimientosHtml = movimientos.map(mov => {
    saldo += mov.tipo === 'cargo' ? mov.monto : -mov.monto;
    let prodInfo = '';
    if (mov.producto !== undefined && mov.producto !== null && productos[mov.producto]) {
      const p = productos[mov.producto];
      prodInfo = ` — Producto: ${p.nombre} x${mov.cantidad} — Monto: $${(mov.monto||0).toFixed(2)}`;
    }
    return `<div style="margin-left: 20px;">${mov.tipo.toUpperCase()}: $${mov.monto.toFixed(2)} ${prodInfo}<button class="btn-eliminar-mov" data-idx="${mov.idx}" style="margin-left:10px;">Eliminar</button></div>`;
  }).join('');

  const owedProducts = {};
  movimientos.forEach(mov => {
    if (mov.tipo === 'cargo' && mov.producto !== undefined && mov.producto !== null) {
      const pid = mov.producto;
      owedProducts[pid] = owedProducts[pid] || { qty: 0, amount: 0 };
      owedProducts[pid].qty += (mov.cantidad || 0);
      owedProducts[pid].amount += (mov.monto || 0);
    }
  });
  let owedHtml = '';
  const owedKeys = Object.keys(owedProducts);
  if (owedKeys.length > 0) {
    owedHtml = '<div style="margin-left:20px;margin-top:6px"><strong><span class="badge owed-badge"><svg class="icon small" aria-hidden="true"><use href="#icon-receipt"></use></svg>Adeuda</span>Productos adeudados:</strong> ' + owedKeys.map(k => {
      const p = productos[k] || { nombre: `(Producto ${k})` };
      const o = owedProducts[k];
      return `${escapeHtml(p.nombre)} x${o.qty} ($${o.amount.toFixed(2)})`;
    }).join(' • ') + '</div>';
  }

  resumenCuentasDiv.innerHTML = `
    <div>
      <strong>${cliente.nombre}</strong>: <em>Saldo: $${saldo.toFixed(2)}</em>
      ${movimientosHtml}
      ${owedHtml}
    </div>`;

  // Re-attach delete buttons handlers for this rendered view
  const buttons2 = resumenCuentasDiv.querySelectorAll('.btn-eliminar-mov');
  buttons2.forEach(b => b.addEventListener('click', async () => {
    const idxMov = parseInt(b.getAttribute('data-idx'));
    if (isNaN(idxMov)) return showToast('Índice inválido', 'error');
    const ok = await showConfirm(`¿Eliminar movimiento #${idxMov + 1}?`);
    if (!ok) return;
    // reuse existing deletion flow by removing and refreshing
    const snapshot = JSON.stringify({ clientes, productos, ventas, cuentas });
    const undoId = pushUndoSnapshot('Movimiento eliminado', snapshot);
    if (cuentas[idxMov].tipo === 'cargo' && cuentas[idxMov].producto !== undefined && productos[cuentas[idxMov].producto]) {
      productos[cuentas[idxMov].producto].stock = (productos[cuentas[idxMov].producto].stock || 0) + (cuentas[idxMov].cantidad || 0);
    }
    cuentas.splice(idxMov, 1);
    saveAppData();
    actualizarResumenCuentas();
    actualizarHistorial();
    showToast('Movimiento eliminado', 'success');
  }));
}

/* -------------------------------------
   Caja: Manejo de movimientos y total
   ------------------------------------- */
function calcularTotalEfectivo() {
  let total = 0;
  ventas.forEach(v => {
    if (v.pagos && Array.isArray(v.pagos) && v.pagos.length > 0) {
      // Sum only the efectivo portions of each pago (they are already allocated to this venta)
      v.pagos.forEach(p => { if (p.metodo === 'efectivo') total += parseFloat(p.monto) || 0; });
    } else if (v.metodoPago === 'efectivo') {
      const prod = productos[v.producto];
      if (prod) total += (parseFloat(prod.precio) || 0) * (parseInt(v.cantidad) || 0);
    }
  });
  return total;
}

function calcularTotalPorMedio(medio) {
  // Support legacy 'tarjeta' by assuming it maps to tarjeta_credito
  let total = 0;
  ventas.forEach(v => {
    if (v.pagos && Array.isArray(v.pagos) && v.pagos.length > 0) {
      v.pagos.forEach(p => {
        const pm = p.metodo;
        if (pm === medio || (pm === 'tarjeta' && medio === 'tarjeta_credito')) total += parseFloat(p.monto) || 0;
      });
    } else {
      let mp = v.metodoPago;
      if (mp === 'tarjeta' && medio === 'tarjeta_credito') mp = 'tarjeta_credito';
      if (mp === medio) {
        const prod = productos[v.producto];
        if (prod) total += (parseFloat(prod.precio) || 0) * (parseInt(v.cantidad) || 0);
      }
    }
  });
  return Math.round(total * 100) / 100;
}

function calcularTotalesPorMedios() {
  return {
    tarjeta_credito: calcularTotalPorMedio('tarjeta_credito'),
    tarjeta_debito: calcularTotalPorMedio('tarjeta_debito'),
    qr: calcularTotalPorMedio('qr'),
    transferencia: calcularTotalPorMedio('transferencia'),
    mercado_pago: calcularTotalPorMedio('mercado_pago'),
  };
}

function actualizarTotalesMedios() {
  const elTarCred = document.getElementById('caja-total-tarjeta-credito');
  const elTarDeb = document.getElementById('caja-total-tarjeta-debito');
  const elQR = document.getElementById('caja-total-qr');
  const elTransfer = document.getElementById('caja-total-transferencia');
  const elMercado = document.getElementById('caja-total-mercado');
  const totals = calcularTotalesPorMedios();
  if (elTarCred) elTarCred.textContent = `Tarjeta Crédito: $${(totals.tarjeta_credito || 0).toFixed(2)}`;
  if (elTarDeb) elTarDeb.textContent = `Tarjeta Débito: $${(0).toFixed(2)}`;
  if (elQR) elQR.textContent = `QR: $${(totals.qr || 0).toFixed(2)}`;
  if (elTransfer) elTransfer.textContent = `Transferencia: $${(totals.transferencia || 0).toFixed(2)}`;
  if (elMercado) elMercado.textContent = `Mercado Pago: $${(totals.mercado_pago || 0).toFixed(2)}`;
}

function calcularTotalRetirado() {
  return cajaMovimientos.reduce((acc, m) => acc + (m.tipo === 'retiro' ? (parseFloat(m.monto) || 0) : 0), 0);
}

function calcularTotalBilletes() {
  return DENOMINACIONES.reduce((acc, d) => acc + (parseInt(cajaBilletes[d] || 0) * d), 0);
}

function formatDate(d = new Date()) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// Calculate totals per payment method for a specific date (YYYY-MM-DD)
function calcularTotalesPorMediosEnFecha(fecha) {
  const totals = { tarjeta_credito: 0, tarjeta_debito: 0, qr: 0, transferencia: 0, mercado_pago: 0 };
  ventas.forEach(v => {
    if (!v || v.fecha !== fecha) return;
    if (v.pagos && Array.isArray(v.pagos) && v.pagos.length > 0) {
      v.pagos.forEach(p => {
        if (!p || !p.metodo) return;
        // legacy: treat 'tarjeta' as tarjeta_credito
        const metodoNorm = (p.metodo === 'tarjeta') ? 'tarjeta_credito' : p.metodo;
        if (totals.hasOwnProperty(metodoNorm)) totals[metodoNorm] += parseFloat(p.monto) || 0;
      });
    } else if (v.metodoPago) {
      const metodoNorm = (v.metodoPago === 'tarjeta') ? 'tarjeta_credito' : v.metodoPago;
      if (totals.hasOwnProperty(metodoNorm)) {
        const prod = productos[v.producto];
        if (prod) totals[metodoNorm] += (parseFloat(prod.precio) || 0) * (parseInt(v.cantidad) || 0);
      }
    }
  });
  // round
  Object.keys(totals).forEach(k => totals[k] = Math.round(totals[k] * 100) / 100);
  return totals;
}

// Register current cajaBilletes for a given date (defaults to today).
function registerBilletesForToday() {
  const fecha = formatDate();
  // deep copy of counts
  const snapshot = {};
  DENOMINACIONES.forEach(d => snapshot[d] = parseInt(cajaBilletes[d] || 0));
  const total = DENOMINACIONES.reduce((acc, d) => acc + (snapshot[d] * d), 0);
  // compute non-cash totals for this date from recorded ventas (no manual input required)
  const mediosHoy = calcularTotalesPorMediosEnFecha(fecha);
  const tarjeta_credito = mediosHoy.tarjeta_credito || 0;
  const tarjeta_debito = mediosHoy.tarjeta_debito || 0;
  const qr = mediosHoy.qr || 0;
  const transferencia = mediosHoy.transferencia || 0;
  const mercado_pago = mediosHoy.mercado_pago || 0;
  // populate the inputs so user can see what was recorded for today
  const inpTarC = document.getElementById('caja-dia-tarjeta-credito');
  const inpTarD = document.getElementById('caja-dia-tarjeta-debito');
  const inpQR = document.getElementById('caja-dia-qr');
  const inpTr = document.getElementById('caja-dia-transferencia');
  const inpM = document.getElementById('caja-dia-mercado');
  if (inpTarC) inpTarC.value = tarjeta_credito.toFixed(2);
  if (inpTarD) inpTarD.value = tarjeta_debito.toFixed(2);
  if (inpQR) inpQR.value = qr.toFixed(2);
  if (inpTr) inpTr.value = transferencia.toFixed(2);
  if (inpM) inpM.value = mercado_pago.toFixed(2);
  // upsert entry for the date
  const existingIdx = cajaBilletesRegistro.findIndex(r => r.fecha === fecha);
  if (existingIdx !== -1) {
    cajaBilletesRegistro[existingIdx] = { fecha, billetes: snapshot, total, tarjeta_credito, tarjeta_debito, qr, transferencia, mercado_pago };
  } else {
    cajaBilletesRegistro.unshift({ fecha, billetes: snapshot, total, tarjeta_credito, tarjeta_debito, qr, transferencia, mercado_pago });
  }
  saveAppData();
  renderBilletesHistorial();
  showToast(`Recuento de billetes guardado para ${fecha}`, 'success');
}

function renderBilletesHistorial() {
  const cont = document.getElementById('caja-billetes-historial');
  if (!cont) return;
  if (!cajaBilletesRegistro || cajaBilletesRegistro.length === 0) {
    cont.innerHTML = '<div class="small muted">No hay recuentos diarios guardados.</div>';
    return;
  }
  cont.innerHTML = cajaBilletesRegistro.map((r, idx) => {
    const total = (r.total || 0).toFixed(2);
    const tc = (r.tarjeta_credito || r.tarjeta || 0).toFixed(2);
    const td = (r.tarjeta_debito || 0).toFixed(2);
    const q = (r.qr || 0).toFixed(2);
    const tr = (r.transferencia || 0).toFixed(2);
    const m = (r.mercado_pago || 0).toFixed(2);
    return `<div class="billete-hist-item" data-idx="${idx}" style="display:flex;justify-content:space-between;align-items:center;padding:.4rem;border-radius:6px;border:1px solid var(--border-color);margin-bottom:.4rem">
        <div style="display:flex;flex-direction:column">
          <div style="font-weight:600">${r.fecha} — Efectivo $${total}</div>
          <div class="small muted">Tarjeta Crédito: $${tc} — Tarjeta Débito: $${td} — QR: $${q} — Transferencia: $${tr} — Mercado Pago: $${m}</div>
        </div>
        <div style="display:flex;gap:.4rem;align-items:center">
          <button class="btn btn-ghost btn-detalle" type="button">Detalles</button>
          <button class="btn btn-danger btn-eliminar-hist" type="button">Eliminar</button>
        </div>
      </div>`;
  }).join('');

  // attach handlers to detail and delete buttons
  cont.querySelectorAll('.btn-detalle').forEach((btn, i) => btn.addEventListener('click', (e) => {
    const idx = i;
    const entry = cajaBilletesRegistro[idx];
    if (!entry) return;
    // show details in a small modal-like inline block (toggle)
    const parent = btn.closest('.billete-hist-item');
    if (!parent) return;
    let details = parent.querySelector('.detalle-billetes');
    if (details) { details.remove(); return; }
    details = document.createElement('div');
    details.className = 'detalle-billetes';
    details.style.marginTop = '.5rem';
    details.style.display = 'grid';
    details.style.gridTemplateColumns = 'repeat(auto-fit,minmax(120px,1fr))';
    details.style.gap = '.4rem';
    details.innerHTML = Object.keys(entry.billetes).map(d => `<div style="padding:.35rem;border-radius:6px;border:1px solid var(--border-color)"><div class="small muted">$${d}</div><div style="font-weight:600">${entry.billetes[d]}</div></div>`).join('');
    // Add non-cash totals if present
    const nc = document.createElement('div');
    nc.style.gridColumn = '1/-1';
    nc.style.display = 'flex';
    nc.style.gap = '.5rem';
    nc.style.alignItems = 'center';
    nc.style.marginTop = '.5rem';
    nc.innerHTML = `<div class="small muted" style="flex:1">Efectivo total: <strong>$${(entry.total||0).toFixed(2)}</strong></div><div class="small muted">Tarjeta Crédito: <strong>$${(entry.tarjeta_credito || entry.tarjeta || 0).toFixed(2)}</strong></div><div class="small muted">Tarjeta Débito: <strong>$${(entry.tarjeta_debito||0).toFixed(2)}</strong></div><div class="small muted">QR: <strong>$${(entry.qr||0).toFixed(2)}</strong></div><div class="small muted">Transferencia: <strong>$${(entry.transferencia||0).toFixed(2)}</strong></div><div class="small muted">Mercado Pago: <strong>$${(entry.mercado_pago||0).toFixed(2)}</strong></div>`;
    details.appendChild(nc);
    parent.appendChild(details);
  }));

  cont.querySelectorAll('.btn-eliminar-hist').forEach((btn, i) => btn.addEventListener('click', async (e) => {
    const idx = i;
    const entry = cajaBilletesRegistro[idx];
    if (!entry) return;
    const ok = await showConfirm(`¿Eliminar recuento de billetes del ${entry.fecha}?`);
    if (!ok) return;
    cajaBilletesRegistro.splice(idx, 1);
    saveAppData();
    renderBilletesHistorial();
    showToast('Recuento eliminado', 'success');
  }));
}

function renderBilletesGrid() {
  const cont = document.getElementById('caja-billetes');
  if (!cont) return;
  // clear existing except header
  cont.innerHTML = '<div class="billete-row" aria-hidden="true" style="grid-column:1/-1; font-weight:600;">Billetes en Caja (recuento físico)</div>';
  DENOMINACIONES.forEach(d => {
    const value = parseInt(cajaBilletes[d] || 0);
    const div = document.createElement('div');
    div.className = 'billete-row';
    div.innerHTML = `
      <label for="billete-${d}">${d} ARS</label>
      <input id="billete-${d}" type="number" min="0" step="1" inputmode="numeric" value="${value}" aria-label="Cantidad de billetes de ${d} ARS" />
    `;
    cont.appendChild(div);
    const input = div.querySelector('input');
    input.addEventListener('change', (e) => {
      const v = parseInt(e.target.value) || 0;
      cajaBilletes[d] = v;
      saveAppData();
      actualizarMovimientosCaja();
    });
  });
}

/**
 * Try to subtract bills from cajaBilletes to cover a given monto (ARS).
 * Uses greedy algorithm from largest to smallest denominations.
 * Returns boolean: true if success (counts updated), false if not possible.
 */
function descontarBilletesPorMonto(monto) {
  let remaining = Math.round((parseFloat(monto) || 0) * 100) / 100;
  if (remaining <= 0) return false;
  // We'll operate in integer ARS, denominations are integer
  const used = {};
  // copy counts to avoid mutating before final confirmation
  const copyCounts = { ...cajaBilletes };
  const denomsDesc = DENOMINACIONES.slice().sort((a, b) => b - a);
  for (let d of denomsDesc) {
    const denom = d;
    const count = copyCounts[denom] || 0;
    if (count <= 0) continue;
    const need = Math.floor(remaining / denom);
    const take = Math.min(need, count);
    if (take > 0) {
      used[denom] = take;
      remaining -= take * denom;
    }
  }
  if (remaining > 0.0001) return false; // couldn't match exact amount
  // apply changes
  Object.keys(used).forEach(k => { cajaBilletes[k] = (cajaBilletes[k] || 0) - used[k]; });
  saveAppData();
  return true;
}

// Decompose a positive ARS amount into bill denominations greedily.
// Returns a map { denom: count } or null if impossible to represent exactly with the bills.
function decomposeBilletes(monto) {
  let remaining = Math.round((parseFloat(monto) || 0) * 100) / 100;
  if (remaining <= 0) return null;
  // We'll only accept integer ARS (no decimals for bill decomposition)
  if (Math.abs(remaining - Math.round(remaining)) > 0.0001) return null;
  remaining = Math.round(remaining);
  const used = {};
  const denomsDesc = DENOMINACIONES.slice().sort((a, b) => b - a);
  for (let d of denomsDesc) {
    const take = Math.floor(remaining / d);
    if (take > 0) {
      used[d] = take;
      remaining -= take * d;
    }
  }
  if (remaining !== 0) return null; // couldn't represent exactly
  return used;
}

// Adds bills counts to cajaBilletes using greedy decomposition, returns true if applied, false otherwise
function incrementarBilletesPorMonto(monto) {
  const used = decomposeBilletes(monto);
  if (!used) return false;
  // snapshot old for undo
  const snapshot = JSON.stringify({ cajaBilletes });
  Object.keys(used).forEach(k => {
    cajaBilletes[k] = (cajaBilletes[k] || 0) + used[k];
  });
  saveAppData();
  actualizarMovimientosCaja();
  showToast('Billetes agregados automáticamente (efectivo).', 'success', 6000, { label: 'Deshacer', callback: () => {
    try {
      cajaBilletes = (JSON.parse(snapshot).cajaBilletes) || cajaBilletes;
      saveAppData();
      actualizarMovimientosCaja();
      showToast('Agregado automático revertido', 'success');
    } catch (e) { console.error('Error al deshacer billetes', e); }
  }});
  return true;
}

function actualizarMovimientosCaja() {
  renderBilletesGrid();
  const totalEl = document.getElementById('caja-total');
  const cont = document.getElementById('movimientos-caja');
  if (!totalEl || !cont) return;
  const totalEfectivo = calcularTotalEfectivo();
  const totalRetirado = calcularTotalRetirado();
  const totalBilletes = calcularTotalBilletes();
  const cajaActual = Math.max(0, totalBilletes - totalRetirado);
  totalEl.textContent = `Caja Total (ARS): $${cajaActual.toFixed(2)}`;
  // show small extra details with ventas cash and billetes count
  const sub = document.createElement('div');
  sub.className = 'small muted';
  sub.style.marginTop = '.25rem';
  sub.textContent = `Efectivo (ventas): $${totalEfectivo.toFixed(2)} — Billetes (recuento): $${totalBilletes.toFixed(2)}`;
  // remove any previous sub
  const existing = totalEl.parentNode.querySelector('.caja-sub');
  if (existing) existing.remove();
  const subWrap = document.createElement('div'); subWrap.className = 'caja-sub'; subWrap.appendChild(sub);
  totalEl.parentNode.appendChild(subWrap);

  if (cajaMovimientos.length === 0) {
    cont.innerHTML = '<div class="small muted">No hay movimientos registrados.</div>';
    return;
  }
  const html = cajaMovimientos.map((m, idx) => {
    const date = m.fecha || new Date().toISOString().split('T')[0];
    const motivo = escapeHtml(m.motivo || '');
    return `<div class="caja-item" data-idx="${idx}"><div><div style="font-weight:600">-$${(parseFloat(m.monto)||0).toFixed(2)}</div><div class="meta">${motivo} • ${date}</div></div><div><button class="remove" data-idx="${idx}" aria-label="Eliminar movimiento">Eliminar</button></div></div>`;
  }).join('');
  cont.innerHTML = html;

  cont.querySelectorAll('.remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const idx = parseInt(btn.getAttribute('data-idx'));
      if (isNaN(idx)) return;
      const ok = await showConfirm('¿Eliminar movimiento de caja?');
      if (!ok) return;
      cajaMovimientos.splice(idx, 1);
      saveAppData();
      actualizarMovimientosCaja();
      actualizarHistorial();
      showToast('Movimiento de caja eliminado', 'success');
    });
  });
  // update totals per payment methods
  actualizarTotalesMedios();
  // ensure historial is up-to-date
  renderBilletesHistorial();
}

// Manejo de eventos y lógica

formCliente.addEventListener('submit', (e) => {
  e.preventDefault();
  const nombre = inputClienteNombre.value.trim();
  if(nombre === '') { showToast('Debe ingresar un nombre de cliente', 'error'); return }
  clientes.push({ nombre, fecha: formatDate() });
  inputClienteNombre.value = '';
  actualizarListaClientes();
  actualizarResumenCuentas();
  saveAppData();
  actualizarHistorial();
  showToast(`Cliente "${nombre}" agregado.`, 'success');
});

formProducto.addEventListener('submit', (e) => {
  e.preventDefault();
  const nombre = inputProductoNombre.value.trim();
  const precio = parseFloat(inputProductoPrecio.value);
  const stock = parseInt(inputProductoStock.value);
  const codigo = document.getElementById('producto-codigo') ? document.getElementById('producto-codigo').value.trim() : '';
  if(nombre === '' || isNaN(precio) || isNaN(stock) || precio < 0 || stock < 0) { showToast('Debe ingresar datos correctos para el producto', 'error'); return }
  // If provided, validate barcode uniqueness
  if (codigo && productos.some(p => p.codigoBarra === codigo)) { showToast('El código de barras ya está asignado a otro producto', 'error'); return }
  const prod = { nombre, precio, stock, codigoBarra: codigo || undefined };
  // If no barcode provided, assign a persistent special code that can be scanned
  if (!codigo) {
    prod.codigoEspecial = generateUniqueSpecialCode();
  }
  prod.fecha = formatDate();
  productos.push(prod);
  inputProductoNombre.value = '';
  inputProductoPrecio.value = '';
  inputProductoStock.value = '';
  const prodCodigoEl = document.getElementById('producto-codigo');
  if (prodCodigoEl) prodCodigoEl.value = '';
  actualizarListaProductosYStock();
  saveAppData();
  actualizarHistorial();
  showToast(`Producto "${nombre}" agregado. ${prod.codigoEspecial ? 'Código especial: ' + prod.codigoEspecial : ''}`, 'success');
  updateVentaResumen();
});

function agregarProductoVenta() {
  const index = productosVentaContainer.children.length;
  const productoItem = document.createElement('div');
  productoItem.className = 'producto-venta-item';
  productoItem.innerHTML = `
    <label for="venta-producto-${index}" class="sr-only">Producto</label>
    <select id="venta-producto-${index}" class="venta-producto" aria-label="Producto" required>
      <option value="" disabled selected>Seleccione Producto</option>
      ${productos.map((producto, idx) => `<option value="${idx}">${producto.nombre}</option>`).join('')}
    </select>
    <input type="number" id="venta-cantidad-${index}" class="venta-cantidad" placeholder="Cantidad" min="1" step="1" required />
    <button type="button" class="btn-remover-producto" data-index="${index}" aria-label="Remover producto" style="background-color: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer;">Remover</button>
  `;
  productosVentaContainer.appendChild(productoItem);

  // Add listener for remove button
  productoItem.querySelector('.btn-remover-producto').addEventListener('click', () => {
    productosVentaContainer.removeChild(productoItem);
    actualizarIndicesProductosVenta();
    updateVentaResumen();
  });

  // Update summary when product or quantity changes
  const select = productoItem.querySelector('.venta-producto');
  const qty = productoItem.querySelector('.venta-cantidad');
  select.addEventListener('change', updateVentaResumen);
  qty.addEventListener('input', updateVentaResumen);
  // If manual allocation is enabled, render allocation inputs for this new row
  if (ventaManualAsignacion && ventaManualAsignacion.checked) renderManualAllocationInputs();
}

function actualizarIndicesProductosVenta() {
  const items = productosVentaContainer.querySelectorAll('.producto-venta-item');
  items.forEach((item, index) => {
    const select = item.querySelector('.venta-producto');
    const input = item.querySelector('.venta-cantidad');
    const button = item.querySelector('.btn-remover-producto');
    select.id = `venta-producto-${index}`;
    input.id = `venta-cantidad-${index}`;
    button.setAttribute('data-index', index);
  });
}

btnAgregarProducto.addEventListener('click', agregarProductoVenta);

// Update the sale summary block: list lines, totals, and stock checks
function updateVentaResumen() {
  const cont = document.getElementById('venta-resumen');
  const lines = document.getElementById('venta-lineas');
  const warningEl = document.getElementById('venta-warning');
  const totalEl = document.getElementById('venta-total');
  const registrarBtn = document.getElementById('btn-registrar-venta');

  if (!cont || !lines) return;
  const items = productosVentaContainer.querySelectorAll('.producto-venta-item');
  lines.innerHTML = '';
  let total = 0;
  let ok = true;

  items.forEach((item, idx) => {
    const prodIdx = item.querySelector('.venta-producto').value;
    const qty = parseInt(item.querySelector('.venta-cantidad').value) || 0;
    let name = '(sin producto)';
    let price = 0;
    let stock = 0;
    if (prodIdx !== '' && productos[prodIdx]) {
      name = productos[prodIdx].nombre;
      price = parseFloat(productos[prodIdx].precio) || 0;
      stock = parseInt(productos[prodIdx].stock) || 0;
    }
    const subtotal = price * qty;
    total += subtotal;

    const div = document.createElement('div');
    div.className = 'line';
    div.innerHTML = `<div style="display:flex;flex-direction:column;gap:.1rem"><span class='product-name'>${name}</span><span class='product-meta'>Precio: $${price.toFixed(2)} — Cant: ${qty} — Stock: ${stock}</span></div><div style='font-weight:700'>$${subtotal.toFixed(2)}</div>`;
    lines.appendChild(div);

    if (qty <= 0 || qty > stock) {
      ok = false;
    }
  });

  totalEl.textContent = `$${total.toFixed(2)}`;
  // Validate split payments if enabled
  let paymentsOk = true;
  const paymentParts = []; // { metodo, monto }
  if (ventaPagoDividido && ventaPagoDividido.checked) {
    const partsEls = ventaListaPagosContainer ? Array.from(ventaListaPagosContainer.querySelectorAll('.venta-pago-parte')) : [];
    let sumParts = 0;
    let valid = true;
    partsEls.forEach(pEl => {
      const mSel = pEl.querySelector('.venta-pago-metodo');
      const mInput = pEl.querySelector('.venta-pago-monto');
      const m = mSel ? mSel.value : '';
      const monto = parseFloat(mInput ? mInput.value : 0) || 0;
      if (!m || monto < 0) valid = false;
      paymentParts.push({ metodo: m, monto });
      sumParts += monto;
    });
    const sumRnd = Math.round(sumParts * 100) / 100;
    paymentsOk = valid && (sumRnd === Math.round(total * 100) / 100);
    const paymentSummaryEl = document.getElementById('venta-pagos-summary');
    if (paymentSummaryEl) paymentSummaryEl.textContent = paymentParts.map(p => `${p.metodo}: $${(p.monto||0).toFixed(2)}`).join(' - ');
  } else {
    const singlePaymentEl = document.getElementById('venta-pagos-summary');
    if (singlePaymentEl) singlePaymentEl.textContent = `Método: ${document.getElementById('venta-metodo-pago').value || '-'} `;
    const metodoPagoSelection = document.getElementById('venta-metodo-pago') ? document.getElementById('venta-metodo-pago').value : '';
    if (!metodoPagoSelection) paymentsOk = false;
  }
  // If manual allocation is enabled, ensure allocations add up
  if (paymentsOk && ventaManualAsignacion && ventaManualAsignacion.checked) {
    const allocs = readManualAllocations();
    // per product sums
    for (let i = 0; i < allocs.perProduct.length; i++) {
      const p = allocs.perProduct[i];
      const sumParts = Math.round(p.parts.reduce((s,x) => s + x, 0) * 100) / 100;
      const subtotal = Math.round(p.subtotal * 100) / 100;
      if (sumParts !== subtotal) { paymentsOk = false; break; }
    }
    // per part totals match payments
    if (paymentsOk) {
      const parts = readPaymentPartsFromDOM();
      for (let pIdx = 0; pIdx < parts.length; pIdx++) {
        const suma = Math.round((allocs.perPartTotals[pIdx] || 0) * 100) / 100;
        const expected = Math.round((parts[pIdx].monto || 0) * 100) / 100;
        if (suma !== expected) { paymentsOk = false; break; }
      }
    }
  }
  if (items.length === 0) {
    cont.style.display = 'none';
    if (registrarBtn) registrarBtn.disabled = true;
  } else {
    cont.style.display = 'block';
    if (!ok || !paymentsOk) {
      warningEl.style.display = 'block';
      warningEl.textContent = !ok ? 'Hay cantidades inválidas o stock insuficiente en uno o más productos.' : 'Montos de pagos inválidos o no coinciden con el total.';
      registrarBtn.disabled = true;
    } else {
      warningEl.style.display = 'none';
      if (registrarBtn) registrarBtn.disabled = false;
    }
  }
}

formVenta.addEventListener('submit', (e) => {
  e.preventDefault();
  const clienteIndex = ventaClienteSelect ? ventaClienteSelect.value : '';
  const fecha = inputVentaFecha.value;
  const metodoPago = document.getElementById('venta-metodo-pago').value;
  // If using split payments, a single metodoPago isn't required
  if (fecha === '' || (metodoPago === '' && !(ventaPagoDividido && ventaPagoDividido.checked))) { showToast('Debe indicar fecha y método de pago', 'error'); return }

  const productosVenta = [];
  const items = productosVentaContainer.querySelectorAll('.producto-venta-item');
  for (let item of items) {
    const productoIndex = item.querySelector('.venta-producto').value;
    const cantidad = parseInt(item.querySelector('.venta-cantidad').value);
    if(productoIndex === '' || isNaN(cantidad) || cantidad <= 0) {
      showToast('Datos inválidos en uno de los productos', 'error');
      return;
    }
    productosVenta.push({ producto: parseInt(productoIndex), cantidad });
  }

  if(productosVenta.length === 0) { showToast('Debe agregar al menos un producto', 'error'); return }

  // Check stock for all products (validate again before commit)
  for (let pv of productosVenta) {
    const producto = productos[pv.producto];
    if(!producto) {
      showToast('Producto seleccionado no encontrado', 'error');
      return;
    }
    if(producto.stock < pv.cantidad) {
      showToast(`Stock insuficiente para ${producto.nombre}`, 'error');
      updateVentaResumen();
      return;
    }
  }

  // Register sales and update stock dynamically
  const saleTotal = productosVenta.reduce((acc, pv) => {
    const productoObj = productos[pv.producto];
    if (!productoObj) return acc;
    return acc + ((parseFloat(productoObj.precio) || 0) * (parseInt(pv.cantidad) || 0));
  }, 0);
  const isDividido = ventaPagoDividido && ventaPagoDividido.checked;
  let paymentParts = [];
  if (isDividido) {
    paymentParts = readPaymentPartsFromDOM();
    // validate sum
    const sumParts = paymentParts.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
    if (Math.round(sumParts * 100) / 100 !== Math.round(saleTotal * 100) / 100) { showToast('Los montos ingresados no coinciden con el total de la venta', 'error'); return; }
    if (paymentParts.some(p => !p.metodo || isNaN(p.monto) || p.monto < 0)) { showToast('Partes de pago inválidas', 'error'); return; }
  } else {
    // single payment
    const metodo = document.getElementById('venta-metodo-pago').value;
    paymentParts = [{ metodo, monto: Math.round(saleTotal * 100) / 100 }];
  }

  // Use manual allocations if requested
  const manualAlloc = ventaManualAsignacion && ventaManualAsignacion.checked;
  // create a sale id to group the productos that belong to the same sale
  const saleId = `sale-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  if (manualAlloc) {
    const allocs = readManualAllocations();
    // Validate per-product sums
    for (let i = 0; i < allocs.perProduct.length; i++) {
      const p = allocs.perProduct[i];
      if (Math.round(p.parts.reduce((s, x) => s + x, 0) * 100) / 100 !== Math.round(p.subtotal * 100) / 100) {
        showToast('La asignación manual por producto no coincide con el subtotal', 'error');
        return;
      }
    }
    // Validate per-part totals match paymentParts
    for (let i = 0; i < paymentParts.length; i++) {
      const partTotal = allocs.perPartTotals[i] || 0;
      if (Math.round(partTotal * 100) / 100 !== Math.round(paymentParts[i].monto * 100) / 100) {
        showToast('La suma de asignaciones manuales no coincide con el monto total de la parte de pago', 'error');
        return;
      }
    }
    // everything ok: push ventas with allocated pagos (include saleId)
    allocs.perProduct.forEach((pAlloc, idx) => {
      const pv = productosVenta[idx];
      productos[pv.producto].stock -= pv.cantidad;
      const pagosForItem = paymentParts.map((pp, pIdx) => ({ metodo: pp.metodo, monto: Math.round((pAlloc.parts[pIdx] || 0) * 100) / 100 }));
      ventas.push({ cliente: clienteIndex === '' ? null : parseInt(clienteIndex), producto: pv.producto, cantidad: pv.cantidad, fecha, metodoPago: (isDividido ? 'dividido' : paymentParts[0].metodo), pagos: pagosForItem, saleId });
    });
  } else {
    // automatic allocation proportionally
    const allocatedSums = paymentParts.map(() => 0);
    productosVenta.forEach((pv, idx) => {
      const prod = productos[pv.producto];
      const subtotal = (parseFloat(prod.precio) || 0) * (parseInt(pv.cantidad) || 0);
      const ratio = saleTotal > 0 ? subtotal / saleTotal : 0;
      const pagosForItem = paymentParts.map((pp, pidx) => {
        if (idx === productosVenta.length - 1) {
          const remaining = Math.round((pp.monto - allocatedSums[pidx]) * 100) / 100;
          allocatedSums[pidx] += remaining;
          return { metodo: pp.metodo, monto: remaining };
        }
        const amount = Math.round((pp.monto * ratio) * 100) / 100;
        allocatedSums[pidx] += amount;
        return { metodo: pp.metodo, monto: amount };
      });
      productos[pv.producto].stock -= pv.cantidad;
      ventas.push({ cliente: clienteIndex === '' ? null : parseInt(clienteIndex), producto: pv.producto, cantidad: pv.cantidad, fecha, metodoPago: (isDividido ? 'dividido' : paymentParts[0].metodo), pagos: pagosForItem, saleId });
    });
  }

  actualizarListaVentas();
  actualizarListaProductosYStock();
  actualizarStock();

  // Reset form to allow registering a new sale
  inputVentaFecha.value = new Date().toISOString().split('T')[0];
  productosVentaContainer.innerHTML = '';
  agregarProductoVenta(); // Add one default item
  // Reset split payment UI
  if (ventaPagoDividido) {
    ventaPagoDividido.checked = false;
    ventaPagosDiv.style.display = 'none';
  }
  if (ventaListaPagosContainer) {
    ventaListaPagosContainer.innerHTML = '';
  }
  if (ventaManualAsignacion) {
    ventaManualAsignacion.checked = false;
  }

  saveAppData();
  actualizarHistorial();
  actualizarMovimientosCaja();
  renderBilletesGrid();
  // NOTE: guardar-billetes click handler is attached once during initialization (below)
  showToast('Venta registrada correctamente', 'success');

  // Auto-increment billetes by cash amount if possible (sum of efectivo parts)
  (function tryAutoIncrementBilletes() {
    // compute efectivo total for this sale
    const efectivoTotal = readPaymentPartsFromDOM().reduce((s, p) => s + (p.metodo === 'efectivo' ? (parseFloat(p.monto)||0) : 0), 0);
    if (efectivoTotal && efectivoTotal > 0) {
      // only attempt if it's a whole ARS amount and decomposition possible
      const applied = incrementarBilletesPorMonto(efectivoTotal);
      if (!applied) {
        showToast('No fue posible agregar billetes automáticamente para el monto en efectivo. Actualiza el recuento manualmente.', 'error', 6000);
      }
    }
  })();
});

formCuenta.addEventListener('submit', (e) => {
  e.preventDefault();
  let clienteIndex = cuentaClienteSelect.value;
  const manualName = inputCuentaNombre ? inputCuentaNombre.value.trim() : '';
  const tipo = selectTipoCuenta.value;
  let monto = parseFloat(inputCuentaMonto.value);
  // If manual name provided, create client and use it
  if (manualName) {
    clientes.push({ nombre: manualName, fecha: formatDate() });
    clienteIndex = String(clientes.length - 1);
    inputCuentaNombre.value = '';
    actualizarListaClientes();
    saveAppData();
    if (cuentaClienteSelect) cuentaClienteSelect.value = clienteIndex;
  }
  // validate basic fields (client can be empty only if manual name provided which creates it)
  if (clienteIndex === '' || isNaN(monto) || monto <= 0 || (tipo !== 'cargo' && tipo !== 'abono')) { showToast('Datos inválidos para movimiento de cuenta', 'error'); return }
  // optional product association
  const productoIndex = cuentaProductoSelect && cuentaProductoSelect.value !== '' ? parseInt(cuentaProductoSelect.value) : null;
  const cantidadProd = productoIndex !== null && cuentaProductoCantidad ? Math.max(1, parseInt(cuentaProductoCantidad.value) || 1) : null;

  // If a product is associated with a cargo, compute the amount from product price * qty and decrement stock
  if (tipo === 'cargo' && productoIndex !== null) {
    const producto = productos[productoIndex];
    if (!producto) { showToast('Producto inválido', 'error'); return }
    if (producto.stock < cantidadProd) { showToast('Stock insuficiente para registrar este cargo', 'error'); return }
    monto = Math.round((producto.precio * cantidadProd) * 100) / 100;
    // decrease stock
    producto.stock -= cantidadProd;
    // save movement with product reference
    cuentas.push({ cliente: parseInt(clienteIndex), monto, tipo, producto: productoIndex, cantidad: cantidadProd, fecha: formatDate() });
    // update product UI
    actualizarListaProductosYStock();
  } else {
    cuentas.push({ cliente: parseInt(clienteIndex), monto, tipo, fecha: formatDate() });
  }
  actualizarResumenCuentas();
  inputCuentaMonto.value = '';
  selectTipoCuenta.value = '';
  if (cuentaProductoSelect) cuentaProductoSelect.value = '';
  if (cuentaProductoCantidad) cuentaProductoCantidad.value = '1';
  saveAppData();
  actualizarHistorial();
  showToast('Movimiento registrado', 'success');
});

// Movimiento de Caja: registrar retiros
if (formCaja) {
  formCaja.addEventListener('submit', async (e) => {
    e.preventDefault();
    const monto = parseFloat(inputCajaMonto.value);
    const motivo = (inputCajaMotivo.value || '').trim();
    if (isNaN(monto) || monto <= 0) { showToast('Ingrese un monto válido', 'error'); return; }
    if (motivo === '') { showToast('Ingrese el motivo del retiro', 'error'); return; }
    // compute disponible
    const disponible = calcularTotalBilletes() - calcularTotalRetirado();
    if (monto > disponible) { showToast('No hay suficiente efectivo en caja', 'error'); return; }
    // add movement
    // attempt to deduct bills by greedy algorithm
    const deducted = descontarBilletesPorMonto(monto);
    if (!deducted) {
      showToast('No fue posible descontar billetes automáticamente para ese monto. Actualice el recuento manualmente.', 'error');
      return;
    }
    const fecha = new Date().toISOString().split('T')[0];
    cajaMovimientos.push({ tipo: 'retiro', monto: parseFloat(monto), motivo, fecha });
    inputCajaMonto.value = '';
    inputCajaMotivo.value = '';
    saveAppData();
    actualizarMovimientosCaja();
    actualizarHistorial();
    showToast('Retiro de caja registrado', 'success');
  });
}

// Funciones para mostrar datos en la sección Historial
function actualizarHistorialClientes() {
  console.log('Render Historial Clientes');
  if (clientes.length === 0) {
    document.getElementById('historial-clientes').innerHTML = emptyStateHTML('No hay clientes registrados.');
    return;
  }
  const html = clientes.map(c => `<div>Cliente: ${c.nombre}</div>`).join('');
  document.getElementById('historial-clientes').innerHTML = `<h3>Clientes</h3>` + html;
}

function actualizarHistorialProductos() {
  console.log('Render Historial Productos');
  if (productos.length === 0) {
    document.getElementById('historial-productos').innerHTML = emptyStateHTML('No hay productos registrados.');
    return;
  }
  const html = productos.map(p => `<div>Producto: ${p.nombre} - Precio: $${p.precio.toFixed(2)} - Stock: ${p.stock}</div>`).join('');
  document.getElementById('historial-productos').innerHTML = `<h3>Productos</h3>` + html;
}

function limpiarDatosInconsistentes() {
  // Limpia ventas que referencian clientes o productos no existentes, y asigna fecha por defecto a ventas sin fecha
  ventas = ventas.filter(v => v.cliente >= 0 && v.cliente < clientes.length && v.producto >= 0 && v.producto < productos.length).map(v => ({ ...v, fecha: v.fecha || formatDate() }));
  // Ensure cuentas reference valid clientes and have fecha
  cuentas = cuentas.filter(c => c.cliente >= 0 && c.cliente < clientes.length).map(c => ({ ...c, fecha: c.fecha || formatDate() }));
  // Ensure clientes and productos have a fecha for historial filtering
  clientes = clientes.map(c => ({ ...c, fecha: c.fecha || formatDate() }));
  productos = productos.map(p => ({ ...p, fecha: p.fecha || formatDate() }));
  // Caja totals might be affected by filtering ventas
  actualizarMovimientosCaja();
}

function actualizarHistorialVentas() {
  console.log('Render Historial Ventas');
  if (ventas.length === 0) {
    document.getElementById('historial-ventas').innerHTML = emptyStateHTML('No hay ventas registradas.');
    return;
  }

  // Agrupar ventas por fecha
  const ventasPorDia = {};
  ventas.forEach((venta, index) => {
    const fecha = venta.fecha;
    if (!ventasPorDia[fecha]) {
      ventasPorDia[fecha] = [];
    }
    ventasPorDia[fecha].push({ ...venta, index });
  });

  // Ordenar fechas
  const fechasOrdenadas = Object.keys(ventasPorDia).sort();

  let html = '';
  let totalVentasGlobal = 0;
  let totalProductosGlobal = 0;
  let totalMontoGlobal = 0;
  fechasOrdenadas.forEach(fecha => {
    const ventasDia = ventasPorDia[fecha];
    // group ventas of the same sale together (saleId)
    const ventasPorVentaId = {};
    ventasDia.forEach(v => {
      const sid = v.saleId || `legacy-${v.index}`;
      if (!ventasPorVentaId[sid]) ventasPorVentaId[sid] = [];
      ventasPorVentaId[sid].push(v);
    });

    let totalProductos = 0;
    let totalMonto = 0;
    // render grouped sales as compact cards with toggleable details
    const ventasHtml = Object.keys(ventasPorVentaId).map(sid => {
      const group = ventasPorVentaId[sid];
      // compute sale totals and aggregate payments
      let saleTotal = 0;
      const paymentAgg = {};
      const clienteNombre = group[0] && clientsafeName(group[0].cliente) || '(Cliente Desconocido)';
      const itemsHtml = group.map(item => {
        const productoNombre = productos[item.producto] ? productos[item.producto].nombre : '(Producto Desconocido)';
        const precio = productos[item.producto] ? productos[item.producto].precio : 0;
        const monto = precio * item.cantidad;
        saleTotal += monto;
        // aggregate pagos
        if (item.pagos && Array.isArray(item.pagos)) {
          item.pagos.forEach(p => { paymentAgg[p.metodo] = (paymentAgg[p.metodo]||0) + (parseFloat(p.monto)||0); });
        }
        totalProductos += item.cantidad;
        totalMonto += monto;
        return `<div class="item"><div><strong>${escapeHtml(productoNombre)}</strong><div class="small muted">Cantidad: ${item.cantidad} — Precio unitario: $${precio.toFixed(2)}</div></div><div style="font-weight:700">$${monto.toFixed(2)}</div></div>`;
      }).join('');
      // payments summary
      const pagosSummary = Object.keys(paymentAgg).map(m => `${escapeHtml(m)}: $${paymentAgg[m].toFixed(2)}`).join(' • ');
      return `<div class="sale-card" data-saleid="${sid}"><div class="sale-header"><div class="title">Venta — Cliente: ${escapeHtml(clienteNombre)}</div><div style="display:flex;gap:.5rem;align-items:center"><div class="meta">${group[0].fecha} • <strong>$${saleTotal.toFixed(2)}</strong></div><button class="btn btn-ghost sale-toggle" type="button" aria-expanded="false">Mostrar detalles</button></div></div><div class="sale-details">${itemsHtml}<div class="payments">Pagos: ${pagosSummary || 'No especificado'}</div></div></div>`;
    }).join('');

    html += `<div><strong>Día: ${fecha}</strong> - Total ventas: ${ventasDia.length} - Total productos vendidos: ${totalProductos} - Monto total: $${totalMonto.toFixed(2)}${ventasHtml}</div>`;
    totalVentasGlobal += ventasDia.length;
    totalProductosGlobal += totalProductos;
    totalMontoGlobal += totalMonto;
  });

  html += `<div style="margin-top: 20px; font-weight: bold; border-top: 1px solid #ccc; padding-top: 10px;">Total General - Ventas totales: ${totalVentasGlobal} - Productos vendidos: ${totalProductosGlobal} - Monto total: $${totalMontoGlobal.toFixed(2)}</div>`;

  document.getElementById('historial-ventas').innerHTML = `<h3>Ventas</h3>` + html;
  // Attach collapse/expand handlers for sale details
  document.querySelectorAll('#historial-ventas .sale-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.sale-card');
      if (!card) return;
      const details = card.querySelector('.sale-details');
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      if (details) {
        details.style.display = expanded ? 'none' : 'block';
        btn.setAttribute('aria-expanded', (!expanded).toString());
        btn.textContent = expanded ? 'Mostrar detalles' : 'Ocultar detalles';
      }
    });
  });
}

function actualizarHistorialCuentas() {
  console.log('Render Historial Cuentas');
  if (cuentas.length === 0) {
    document.getElementById('historial-cuentas').innerHTML = emptyStateHTML('No hay movimientos de cuentas.');
    return;
  }
  const html = cuentas.map((c, idx) => {
    const clienteNombre = clientes[c.cliente] ? clientsafeName(c.cliente) : 'Desconocido';
    let prodInfo = '';
    if (c.producto !== undefined && c.producto !== null && productos[c.producto]) {
      const p = productos[c.producto];
      prodInfo = ` — Producto: ${p.nombre} x${c.cantidad} — Monto: $${(c.monto||0).toFixed(2)}`;
    }
    return `<div>Movimiento #${idx + 1}: Cliente ${clienteNombre} - Tipo: ${c.tipo} - Monto: $${c.monto.toFixed(2)}${prodInfo} - Fecha: ${c.fecha || ''}</div>`;
  }).join('');
  document.getElementById('historial-cuentas').innerHTML = `<h3>Movimientos de Cuentas</h3>` + html;
}

function clientsafeName(idx) {
  return (clientes[idx] && clientes[idx].nombre) ? clientes[idx].nombre : `(Cliente #${idx})`;
}

function actualizarHistorialCaja() {
  if (cajaMovimientos.length === 0) {
    document.getElementById('historial-caja').innerHTML = emptyStateHTML('No hay movimientos de caja.');
    return;
  }
  const html = cajaMovimientos.map((m, idx) => {
    const clienteNombre = m.motivo || 'Sin motivo';
    return `<div>Movimiento #${idx + 1}: Tipo: ${m.tipo} - Monto: $${(parseFloat(m.monto)||0).toFixed(2)} - Motivo: ${escapeHtml(m.motivo || '')} - Fecha: ${m.fecha || ''}</div>`;
  }).join('');
  document.getElementById('historial-caja').innerHTML = `<h3>Movimientos de Caja</h3>` + html;
  // show billetes counts summary below history
  const billetesHtml = `<div style="margin-top:8px"><strong>Billetes (conteo actual):</strong> ${DENOMINACIONES.map(d => `${d}x${cajaBilletes[d] || 0}`).join(' • ')} — Total: $${calcularTotalBilletes().toFixed(2)}</div>`;
  document.getElementById('historial-caja').innerHTML += billetesHtml;
  // Also show totals by payment methods in the historial
  const totals = calcularTotalesPorMedios();
  const mediosHtml = `<div style="margin-top:8px"><strong>Totales por medio:</strong> Tarjeta Crédito: $${(totals.tarjeta_credito||0).toFixed(2)} • Tarjeta Débito: $${(totals.tarjeta_debito||0).toFixed(2)} • QR: $${(totals.qr||0).toFixed(2)} • Transferencia: $${totals.transferencia.toFixed(2)} • Mercado Pago: $${totals.mercado_pago.toFixed(2)}</div>`;
  document.getElementById('historial-caja').innerHTML += mediosHtml;
  // Add registro diario de billetes
  if (Array.isArray(cajaBilletesRegistro) && cajaBilletesRegistro.length > 0) {
    const registroHtml = `<div style="margin-top:8px"><strong>Recuento diario de billetes:</strong><div class="small muted" style="margin-top:.5rem">` + cajaBilletesRegistro.map(r => `${r.fecha}: $${(r.total||0).toFixed(2)}`).join(' — ') + `</div></div>`;
    document.getElementById('historial-caja').innerHTML += registroHtml;
  }
}

// ---------- Historial por fecha (calendario & filtrado) ----------
let historialSelectedDate = null;
let historialCalendarYear = new Date().getFullYear();
let historialCalendarMonth = new Date().getMonth(); // 0-based

function countEntriesByDate(fecha) {
  const ventasCount = ventas.filter(v => v.fecha === fecha).length;
  const cajaCount = (cajaMovimientos.filter(m => m.fecha === fecha).length) + (cajaBilletesRegistro.filter(r => r.fecha === fecha).length);
  const cuentasCount = cuentas.filter(c => (c.fecha || '') === fecha).length;
  const clientesCount = clientes.filter(c => (c.fecha || '') === fecha).length;
  const productosCount = productos.filter(p => (p.fecha || '') === fecha).length;
  return { ventasCount, cajaCount, cuentasCount, clientesCount, productosCount };
}

function renderCalendar(year = historialCalendarYear, month = historialCalendarMonth) {
  historialCalendarYear = year; historialCalendarMonth = month;
  const grid = document.querySelector('#historial-calendar .calendar-grid');
  const label = document.getElementById('historial-month-label');
  if (!grid || !label) return;
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  label.textContent = first.toLocaleString('es-AR', { month: 'short', year: 'numeric' });
  grid.innerHTML = '';
  // leading blanks (weekday 0 = Sunday; show Mon-Sun heading not required but keep simple)
  const startWeekday = (first.getDay() + 6) % 7; // shift Mon=0
  for (let i = 0; i < startWeekday; i++) {
    const cell = document.createElement('div'); cell.className = 'day empty'; cell.innerHTML = '';
    grid.appendChild(cell);
  }
  for (let d = 1; d <= last.getDate(); d++) {
    const dt = new Date(year, month, d);
    const fecha = formatDate(dt);
    const counts = countEntriesByDate(fecha);
    const cell = document.createElement('div'); cell.className = 'day'; cell.setAttribute('data-fecha', fecha);
    const num = document.createElement('div'); num.className = 'date-num'; num.textContent = d;
    cell.appendChild(num);
    // small badges for counts
    const badges = document.createElement('div'); badges.className = 'day-badges';
    if (counts.ventasCount) { const b = document.createElement('span'); b.className = 'badge-small'; b.textContent = `V:${counts.ventasCount}`; badges.appendChild(b); }
    if (counts.cajaCount) { const b = document.createElement('span'); b.className = 'badge-small'; b.textContent = `C:${counts.cajaCount}`; badges.appendChild(b); }
    if (counts.cuentasCount) { const b = document.createElement('span'); b.className = 'badge-small'; b.textContent = `A:${counts.cuentasCount}`; badges.appendChild(b); }
    if (counts.clientesCount) { const b = document.createElement('span'); b.className = 'badge-small'; b.textContent = `Cli:${counts.clientesCount}`; badges.appendChild(b); }
    if (counts.productosCount) { const b = document.createElement('span'); b.className = 'badge-small'; b.textContent = `P:${counts.productosCount}`; badges.appendChild(b); }
    cell.appendChild(badges);
    // highlight today
    const today = formatDate(new Date());
    if (fecha === today) cell.classList.add('is-today');
    if (historialSelectedDate === fecha) cell.classList.add('is-selected');
    // click handler selects date
    cell.addEventListener('click', () => {
      if (cell.classList.contains('empty')) return;
      selectHistorialDate(fecha);
    });
    grid.appendChild(cell);
  }
}

function selectHistorialDate(fecha) {
  historialSelectedDate = fecha;
  const input = document.getElementById('historial-filter-date');
  const label = document.getElementById('historial-selected-date-label');
  if (input) input.value = fecha;
  if (label) label.textContent = fecha;
  // update calendar selection visuals
  document.querySelectorAll('#historial-calendar .day').forEach(el => el.classList.toggle('is-selected', el.getAttribute('data-fecha') === fecha));
  renderFilteredHistorial(fecha);
}

function clearHistorialFilter() {
  historialSelectedDate = null;
  const input = document.getElementById('historial-filter-date');
  const label = document.getElementById('historial-selected-date-label');
  if (input) input.value = '';
  if (label) label.textContent = '(ninguna fecha seleccionada)';
  document.querySelectorAll('#historial-calendar .day').forEach(el => el.classList.remove('is-selected'));
  // revert to the normal aggregated historial
  actualizarHistorial();
}

function renderFilteredHistorial(fecha) {
  // Ventas del día (agrupadas por saleId para mostrar todas las líneas de una venta juntas)
  const ventasDia = ventas.filter(v => v.fecha === fecha);
  if (ventasDia.length === 0) {
    document.getElementById('historial-ventas').innerHTML = `<h3>Ventas — ${fecha}</h3>` + emptyStateHTML('No hay ventas para esta fecha.');
  } else {
    // agrupar por saleId
    const ventasPorVentaId = {};
    ventasDia.forEach((v, idx) => {
      const sid = v.saleId || `legacy-${idx}`;
      if (!ventasPorVentaId[sid]) ventasPorVentaId[sid] = [];
      ventasPorVentaId[sid].push(v);
    });

    let totalProductos = 0;
    let totalMonto = 0;
    let totalVentas = 0;

    const ventasHtml = Object.keys(ventasPorVentaId).map(sid => {
      const group = ventasPorVentaId[sid];
      totalVentas += 1;
      let saleTotal = 0;
      const paymentAgg = {};
      const clienteNombre = group[0] && clientsafeName(group[0].cliente) || '(Cliente Desconocido)';
      const itemsHtml = group.map(item => {
        const productoNombre = productos[item.producto] ? productos[item.producto].nombre : '(Producto Desconocido)';
        const precio = productos[item.producto] ? productos[item.producto].precio : 0;
        const monto = precio * item.cantidad;
        saleTotal += monto;
        // aggregate pagos
        if (item.pagos && Array.isArray(item.pagos)) {
          item.pagos.forEach(p => { paymentAgg[p.metodo] = (paymentAgg[p.metodo]||0) + (parseFloat(p.monto)||0); });
        }
        totalProductos += item.cantidad;
        totalMonto += monto;
        return `<div class="item"><div><strong>${escapeHtml(productoNombre)}</strong><div class="small muted">Cantidad: ${item.cantidad} — Precio unitario: $${precio.toFixed(2)}</div></div><div style="font-weight:700">$${monto.toFixed(2)}</div></div>`;
      }).join('');

      const pagosSummary = Object.keys(paymentAgg).map(m => `${escapeHtml(m)}: $${paymentAgg[m].toFixed(2)}`).join(' • ');
      return `<div class="sale-card" data-saleid="${sid}"><div class="sale-header"><div class="title">Venta — Cliente: ${escapeHtml(clienteNombre)}</div><div style="display:flex;gap:.5rem;align-items:center"><div class="meta">${group[0].fecha} • <strong>$${saleTotal.toFixed(2)}</strong></div><button class="btn btn-ghost sale-toggle" type="button" aria-expanded="false">Mostrar detalles</button></div></div><div class="sale-details">${itemsHtml}<div class="payments">Pagos: ${pagosSummary || 'No especificado'}</div></div></div>`;
    }).join('');

    const resumenHtml = `<div><strong>Fecha: ${fecha}</strong> — Ventas: ${totalVentas} — Productos vendidos: ${totalProductos} — Monto total: $${totalMonto.toFixed(2)}</div>`;
    document.getElementById('historial-ventas').innerHTML = `<h3>Ventas — ${fecha}</h3>` + resumenHtml + ventasHtml;

    // Attach toggle handlers
    document.querySelectorAll('#historial-ventas .sale-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.sale-card');
        if (!card) return;
        const details = card.querySelector('.sale-details');
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        if (details) {
          details.style.display = expanded ? 'none' : 'block';
          btn.setAttribute('aria-expanded', (!expanded).toString());
          btn.textContent = expanded ? 'Mostrar detalles' : 'Ocultar detalles';
        }
      });
    });
  }

  // Caja (movimientos and snapshots) del día
  const cajaMovs = cajaMovimientos.filter(m => m.fecha === fecha);
  const cajaSnap = cajaBilletesRegistro.filter(r => r.fecha === fecha);
  const cHtml = (cajaMovs.length === 0 && cajaSnap.length === 0) ? emptyStateHTML('No hay movimientos de caja para esta fecha.') : cajaMovs.map((m, i) => `<div class="entry"><div class="meta">${m.fecha}</div><div><strong>Tipo:</strong> ${m.tipo} — $${(parseFloat(m.monto)||0).toFixed(2)}</div></div>`).join('') + cajaSnap.map(s => `<div class="entry"><div class="meta">${s.fecha} • Recuento</div><div><strong>Total efectivo:</strong> $${(s.total||0).toFixed(2)}</div></div>`).join('');
  document.getElementById('historial-caja').innerHTML = `<h3>Caja — ${fecha}</h3>` + cHtml;
  // Cuentas
  const cuentasDia = cuentas.filter(c => (c.fecha || '') === fecha);
  const cuHtml = cuentasDia.length === 0 ? emptyStateHTML('No hay movimientos de cuentas para esta fecha.') : cuentasDia.map((c, i) => `<div class="entry"><div class="meta">${c.fecha}</div><div><strong>${clientsafeName(c.cliente)}</strong> — ${c.tipo} — $${(c.monto||0).toFixed(2)}</div></div>`).join('');
  document.getElementById('historial-cuentas').innerHTML = `<h3>Cuentas — ${fecha}</h3>` + cuHtml;

  // Clientes / Productos añadidos en la fecha
  const cliDia = clientes.filter(c => (c.fecha || '') === fecha);
  document.getElementById('historial-clientes').innerHTML = `<h3>Clientes añadidos — ${fecha}</h3>` + (cliDia.length === 0 ? emptyStateHTML('No se agregaron clientes en esta fecha.') : cliDia.map(c => `<div class="entry"><div class="meta">${c.fecha}</div><div><strong>${c.nombre}</strong></div></div>`).join(''));
  const prodDia = productos.filter(p => (p.fecha || '') === fecha);
  document.getElementById('historial-productos').innerHTML = `<h3>Productos añadidos — ${fecha}</h3>` + (prodDia.length === 0 ? emptyStateHTML('No se agregaron productos en esta fecha.') : prodDia.map(p => `<div class="entry"><div class="meta">${p.fecha}</div><div><strong>${p.nombre}</strong> — $${(p.precio||0).toFixed(2)}</div></div>`).join(''));
}

// Keep existing actualizarHistorial aggregator for the 'no filter' state
function actualizarHistorial() {
  actualizarHistorialClientes();
  actualizarHistorialProductos();
  actualizarHistorialVentas();
  actualizarHistorialCuentas();
  actualizarHistorialCaja();
  // after rendering aggregated lists, ensure calendar reflects current month and selection
  renderCalendar();
}

/* ===== INITIALIZE ALL EVENT LISTENERS ===== */
function initializeEventListeners() {
  // --- Tabs navegación superior ---
  const tabLinks = document.querySelectorAll('.tab-link');
  const mainSections = document.querySelectorAll('.main-section');
  const mainTitle = document.getElementById('main-title');
  
  function showSection(sectionId, enterFullscreen = true) {
    mainSections.forEach(sec => sec.classList.remove('active'));
    const sec = document.getElementById(sectionId);
    if (sec) sec.classList.add('active');
    tabLinks.forEach((btn, i) => {
      const isActive = btn.getAttribute('data-section') === sectionId;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.tabIndex = isActive ? 0 : -1;
    });
    // Cambiar título principal
    if (mainTitle && sec) {
      const h = sec.querySelector('.card-title span');
      mainTitle.textContent = h ? h.textContent : 'KevStore';
    }

    // Calculate header height
    const headerEl = document.querySelector('.main-header');
    if (headerEl) {
      const headerH = Math.ceil(headerEl.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--header-height', headerH + 'px');
    }
    // Always make the selected section fullscreen
    document.body.classList.add('section-fullscreen');
    // If opening Caja, populate today's computed totals into the inputs
    if (sectionId === 'caja-section') {
      populateCajaDayInputs();
      actualizarTotalesMedios();
      renderBilletesGrid();
      renderBilletesHistorial();
      actualizarMovimientosCaja();
    }
    // If opening Historial, render the calendar and clear the specific date filter so user sees aggregated view
    if (sectionId === 'historial-section') {
      renderCalendar();
      clearHistorialFilter();
    }
  }
  
  // Attach tab navigation listeners
  tabLinks.forEach(btn => {
    btn.addEventListener('click', () => {
      showSection(btn.getAttribute('data-section'));
      btn.focus();
    });
    btn.addEventListener('keydown', e => {
      const idx = Array.from(tabLinks).indexOf(btn);
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = tabLinks[(idx + 1) % tabLinks.length];
        next.focus();
        showSection(next.getAttribute('data-section'));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = tabLinks[(idx - 1 + tabLinks.length) % tabLinks.length];
        prev.focus();
        showSection(prev.getAttribute('data-section'));
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showSection(btn.getAttribute('data-section'));
      }
    });
  });

  // Wire up search fields for clients/products
  if (buscarClienteInput) {
    buscarClienteInput.addEventListener('input', (e) => filterClientes(e.target.value));
    buscarClienteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = listaClientes ? listaClientes.querySelector('.list-item') : null;
        if (first) {
          const idx = parseInt(first.getAttribute('data-index'));
          if (!isNaN(idx)) {
            if (cuentaClienteSelect) cuentaClienteSelect.value = idx;
            showToast(`Cliente ${clientes[idx].nombre} seleccionado`, 'success');
            showClientDetails(idx);
          }
        }
      }
    });
    limpiarBuscarClientesBtn && limpiarBuscarClientesBtn.addEventListener('click', () => { buscarClienteInput.value = ''; actualizarListaClientes(); showToast('Búsqueda de clientes limpiada', 'success'); });
  }
  if (buscarProductoInput) {
    buscarProductoInput.addEventListener('input', (e) => filterProductos(e.target.value));
    limpiarBuscarProductosBtn && limpiarBuscarProductosBtn.addEventListener('click', () => { buscarProductoInput.value = ''; actualizarListaProductosYStock(); showToast('Búsqueda de productos limpiada', 'success'); });
  }

  // Venta: search input wiring (name or code)
  const ventaBuscarInput = document.getElementById('venta-buscar-producto');
  if (ventaBuscarInput) {
    ventaBuscarInput.addEventListener('input', (e) => {
      const q = (e.target.value || '').trim();
      const results = searchProductsForVenta(q);
      renderVentaSearchSuggestions(results);
      filterProductos(q);
    });
    ventaBuscarInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const q = (e.target.value || '').trim();
        if (!q) return;
        const exact = productos.findIndex(p => (p.codigoBarra === q) || (p.codigoEspecial === q) || p.nombre.toLowerCase() === q.toLowerCase());
        if (exact !== -1) {
          selectProductForVenta(String(exact));
          ventaBuscarInput.value = '';
          clearVentaSearchSuggestions();
        } else {
          const results = searchProductsForVenta(q);
          if (results.length > 0) {
            selectProductForVenta(String(results[0].idx));
            ventaBuscarInput.value = '';
            clearVentaSearchSuggestions();
          } else {
            showToast('No se encontró producto', 'error');
          }
        }
      }
    });
    ventaBuscarInput.addEventListener('blur', () => { setTimeout(clearVentaSearchSuggestions, 200); });
  }

  // Wire up cuenta-producto changes to auto-calc monto
  if (cuentaProductoSelect) cuentaProductoSelect.addEventListener('change', (e) => updateCuentaMontoFromProduct());
  if (cuentaProductoCantidad) cuentaProductoCantidad.addEventListener('input', (e) => updateCuentaMontoFromProduct());
  // when a client is selected from the dropdown, show their account details
  if (cuentaClienteSelect) cuentaClienteSelect.addEventListener('change', (e) => {
    const val = cuentaClienteSelect.value;
    if (val !== '') showClientDetails(val);
  });

  // --- Lector de código de barras ---
  const barcodeModal = document.getElementById('barcode-modal');
  const openBarcodeBtn = document.getElementById('open-barcode-modal');
  const closeBarcodeBtn = document.getElementById('close-barcode-modal');
  const barcodeVideo = document.getElementById('barcode-video');
  const barcodeResult = document.getElementById('barcode-result');
  const barcodeInput = document.getElementById('barcode-input');
  const barcodeManualBtn = document.getElementById('barcode-manual-btn');

  // Attach guardar-billetes handler once
  const guardarBtn = document.getElementById('guardar-billetes');
  if (guardarBtn) guardarBtn.addEventListener('click', (e) => {
    e.preventDefault();
    DENOMINACIONES.forEach(d => {
      const inp = document.getElementById(`billete-${d}`);
      if (inp) cajaBilletes[d] = parseInt(inp.value) || 0;
    });
    registerBilletesForToday();
    actualizarMovimientosCaja();
  });
  
  let quaggaActive = false;

  // Historial calendar controls wiring
  const histPrev = document.getElementById('historial-prev-month');
  const histNext = document.getElementById('historial-next-month');
  const histDateInput = document.getElementById('historial-filter-date');
  const histTodayBtn = document.getElementById('historial-filter-today');
  const histClearBtn = document.getElementById('historial-clear-filter');
  if (histPrev) histPrev.addEventListener('click', (e) => { e.preventDefault(); historialCalendarMonth -= 1; if (historialCalendarMonth < 0) { historialCalendarMonth = 11; historialCalendarYear -= 1; } renderCalendar(historialCalendarYear, historialCalendarMonth); });
  if (histNext) histNext.addEventListener('click', (e) => { e.preventDefault(); historialCalendarMonth += 1; if (historialCalendarMonth > 11) { historialCalendarMonth = 0; historialCalendarYear += 1; } renderCalendar(historialCalendarYear, historialCalendarMonth); });
  if (histDateInput) histDateInput.addEventListener('change', (e) => { if (e.target.value) selectHistorialDate(e.target.value); });
  if (histTodayBtn) histTodayBtn.addEventListener('click', (e) => { e.preventDefault(); const today = formatDate(); selectHistorialDate(today); renderCalendar(new Date().getFullYear(), new Date().getMonth()); });
  if (histClearBtn) histClearBtn.addEventListener('click', (e) => { e.preventDefault(); clearHistorialFilter(); });

  function showBarcodeModal() {
    barcodeModal.setAttribute('aria-hidden', 'false');
    barcodeModal.style.display = 'flex';
    barcodeResult.textContent = '';
    startBarcodeScanner();
    barcodeInput.value = '';
    setTimeout(() => { barcodeInput.focus(); }, 400);
  }
  function hideBarcodeModal() {
    barcodeModal.setAttribute('aria-hidden', 'true');
    barcodeModal.style.display = 'none';
    stopBarcodeScanner();
  }
  if (openBarcodeBtn) openBarcodeBtn.addEventListener('click', showBarcodeModal);
  const openBarcodeFromProductos = document.querySelectorAll('.open-barcode-in-products');
  openBarcodeFromProductos.forEach(b => b.addEventListener('click', showBarcodeModal));
  if (closeBarcodeBtn) closeBarcodeBtn.addEventListener('click', hideBarcodeModal);
  barcodeModal.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideBarcodeModal(); });

  function startBarcodeScanner() {
    if (!window.Quagga) return;
    if (quaggaActive) return;
    Quagga.init({
      inputStream: {
        type: 'LiveStream',
        target: barcodeVideo,
        constraints: { facingMode: 'environment' }
      },
      decoder: { readers: ['ean_reader', 'ean_8_reader', 'code_128_reader', 'upc_reader'] },
      locate: true
    }, function(err) {
      if (err) { barcodeResult.textContent = 'No se pudo iniciar la cámara.'; return; }
      Quagga.start();
      quaggaActive = true;
      barcodeVideo.style.display = '';
    });
    Quagga.onDetected(onBarcodeDetected);
  }
  function stopBarcodeScanner() {
    if (window.Quagga && quaggaActive) {
      Quagga.stop();
      quaggaActive = false;
      barcodeVideo.style.display = 'none';
      Quagga.offDetected(onBarcodeDetected);
    }
  }
  function onBarcodeDetected(result) {
    if (!result || !result.codeResult || !result.codeResult.code) return;
    const code = result.codeResult.code;
    barcodeResult.innerHTML = `<div class="barcode-success">Código detectado: <strong>${escapeHtml(code)}</strong></div>`;
    stopBarcodeScanner();
    renderBarcodeResultInProductos(code, 'detected');
    seleccionarProductoPorCodigo(code);
    setTimeout(hideBarcodeModal, 1200);
  }
  barcodeManualBtn.addEventListener('click', () => {
    const code = barcodeInput.value.trim();
    if (!code) return;
    barcodeResult.innerHTML = `<div class="barcode-success">Código ingresado: <strong>${escapeHtml(code)}</strong></div>`;
    renderBarcodeResultInProductos(code, 'manual');
    seleccionarProductoPorCodigo(code);
    setTimeout(hideBarcodeModal, 1200);
  });
  barcodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') barcodeManualBtn.click();
  });

  // Split payment checkbox toggle and livetext updates
  const ventaMetodoPagoEl = document.getElementById('venta-metodo-pago');
  if (ventaPagoDividido) {
    ventaPagosDiv.style.display = ventaPagoDividido.checked ? 'block' : 'none';
    ventaPagoDividido.addEventListener('change', (e) => {
      const checked = e.target.checked;
      ventaPagosDiv.style.display = checked ? 'block' : 'none';
      if (ventaMetodoPagoEl) {
        ventaMetodoPagoEl.required = !checked;
        ventaMetodoPagoEl.disabled = checked;
        ventaMetodoPagoEl.style.display = checked ? 'none' : '';
      }
      if (!checked) {
        if (ventaListaPagosContainer) ventaListaPagosContainer.innerHTML = '';
        if (ventaManualAsignacion) ventaManualAsignacion.checked = false;
      } else {
        ensureAtLeastOnePayment();
      }
      updateVentaResumen();
    });
    const ventaMetodoPago = document.getElementById('venta-metodo-pago');
    if (ventaMetodoPago) {
      ventaMetodoPago.addEventListener('change', updateVentaResumen);
      ventaMetodoPago.addEventListener('input', updateVentaResumen);
    }
  }

  // --- Keyboard-based scanner support ---
  let scanBuffer = '';
  let scanBufferTimer = null;
  const SCAN_CHAR_TIMEOUT = 120;

  function resetScanBuffer() {
    scanBuffer = '';
    if (scanBufferTimer) { clearTimeout(scanBufferTimer); scanBufferTimer = null; }
  }

  document.addEventListener('keydown', (ev) => {
    try {
      if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
      const active = document.activeElement;
      const tag = active && active.tagName ? active.tagName.toLowerCase() : '';
      const isTypingField = tag === 'input' || tag === 'textarea' || active && active.isContentEditable;
      if (isTypingField) return;

      if (ev.key === 'Enter') {
        if (scanBuffer.length > 1) {
          const code = scanBuffer;
          const ventasSection = document.getElementById('ventas-section');
          const isVentasActive = ventasSection && ventasSection.classList.contains('active');
          if (isVentasActive) addProductToSaleByIndex(productos.findIndex(p => p.codigoBarra === code));
          else seleccionarProductoPorCodigo(code);
        }
        resetScanBuffer();
        return;
      }

      if (ev.key && ev.key.length === 1) {
        scanBuffer += ev.key;
        if (scanBufferTimer) clearTimeout(scanBufferTimer);
        scanBufferTimer = setTimeout(resetScanBuffer, SCAN_CHAR_TIMEOUT);
      }
    } catch (err) {
      // fail silently
    }
  });

  function seleccionarProductoPorCodigo(code) {
    const idx = productos.findIndex(p => p.codigoBarra === code);
    if (idx === -1) {
      const idxSpecial = productos.findIndex(p => p.codigoEspecial === code);
      if (idxSpecial !== -1) {
        showToast(`Producto encontrado (código especial): ${productos[idxSpecial].nombre}`, 'success');
        const ventasSection = document.getElementById('ventas-section');
        const isVentasActive = ventasSection && ventasSection.classList.contains('active');
        if (isVentasActive) { addProductToSaleByIndex(idxSpecial); return; }
        actualizarListaProductosYStock();
        setTimeout(() => {
          const items = document.querySelectorAll('#lista-productos-stock .producto-item');
          if (items[idxSpecial]) {
            items[idxSpecial].classList.add('producto-resaltado');
            items[idxSpecial].scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => items[idxSpecial].classList.remove('producto-resaltado'), 1800);
          }
        }, 100);
        return;
      }
    }
    if (idx !== -1) {
      showToast(`Producto encontrado: ${productos[idx].nombre}`, 'success');
      const ventasSection = document.getElementById('ventas-section');
      const isVentasActive = ventasSection && ventasSection.classList.contains('active');
      if (isVentasActive) {
        addProductToSaleByIndex(idx);
        return;
      }
      actualizarListaProductosYStock();
      setTimeout(() => {
        const items = document.querySelectorAll('#lista-productos-stock .producto-item');
        if (items[idx]) {
          items[idx].classList.add('producto-resaltado');
          items[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => items[idx].classList.remove('producto-resaltado'), 1800);
        }
      }, 100);
    } else {
      showToast('Producto no encontrado', 'error');
      renderBarcodeResultInProductos(code, 'not-found');
    }
  }

  function addProductToSaleByIndex(productIndex, qtyToAdd = 1) {
    if (typeof productIndex !== 'number' || productIndex < 0 || productIndex >= productos.length) {
      showToast('Producto no válido para agregar a la venta', 'error');
      return;
    }

    const items = productosVentaContainer.querySelectorAll('.producto-venta-item');
    let found = false;
    for (let item of items) {
      const select = item.querySelector('.venta-producto');
      const qtyEl = item.querySelector('.venta-cantidad');
      if (select && select.value !== '' && parseInt(select.value) === productIndex) {
        const current = parseInt(qtyEl.value) || 0;
        qtyEl.value = current + qtyToAdd;
        found = true;
        break;
      }
    }

    if (!found) {
      agregarProductoVenta();
      const all = productosVentaContainer.querySelectorAll('.producto-venta-item');
      const last = all[all.length - 1];
      if (last) {
        const select = last.querySelector('.venta-producto');
        const qtyEl = last.querySelector('.venta-cantidad');
        if (select) select.value = String(productIndex);
        if (qtyEl) qtyEl.value = String(qtyToAdd);
      }
    }

    showSection('ventas-section');
    updateVentaResumen();
    showToast(`${productos[productIndex].nombre} agregado a la venta`, 'success');
  }

  function renderBarcodeResultInProductos(code, mode = 'detected') {
    try {
      const el = document.getElementById('productos-barcode-result');
      if (!el) return;
      showSection('productos-stock-section');
      const escaped = escapeHtml(code);
      let content = '';
      if (mode === 'detected') {
        const idx = productos.findIndex(p => p.codigoBarra === code);
        if (idx !== -1) {
          content = `<div class="barcode-success">Código detectado: <strong>${escaped}</strong> — Producto: <strong>${escapeHtml(productos[idx].nombre)}</strong></div>`;
        } else {
          content = `<div class="barcode-success">Código detectado: <strong>${escaped}</strong> — <span class="muted">Producto no encontrado</span></div>`;
        }
      } else if (mode === 'manual') {
        content = `<div class="barcode-success">Código ingresado: <strong>${escaped}</strong></div>`;
      } else if (mode === 'not-found') {
        content = `<div class="barcode-success" style="color:var(--danger)">Código: <strong>${escaped}</strong> — <strong>No encontrado</strong></div>`;
      }
      el.innerHTML = content;
      el.style.display = '';
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      setTimeout(() => { el.style.transition = 'opacity .26s ease, transform .26s ease'; el.style.opacity = '1'; el.style.transform = 'none'; }, 10);
      setTimeout(() => {
        try { el.style.opacity = '0'; el.style.transform = 'translateY(6px)'; setTimeout(()=>el.style.display='none', 260); } catch(e){}
      }, 4000);
    } catch (e) {
      console.error('renderBarcodeResultInProductos error', e);
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM fully loaded and parsed');
  
  // Initialize all event listeners
  initializeEventListeners();
  
  // Load app data and initialize UI
  await loadAppData();
  limpiarDatosInconsistentes();
  
  // Set default date to today
  inputVentaFecha.value = new Date().toISOString().split('T')[0];
  
  // Initialize sales form with one product item
  agregarProductoVenta();
  updateVentaResumen();
  
  // Update all displays
  actualizarListaClientes();
  actualizarListaProductosYStock();
  actualizarListaVentas();
  actualizarResumenCuentas();
  actualizarMovimientosCaja();
  renderBilletesHistorial();
  actualizarHistorial();
  
  // DON'T show the main app here - let auth.js handle it
  // The main app will be shown by auth.js after successful authentication
});

// Función para mostrar la app principal (llamada por auth.js después del login)
function showMainApp() {
  const mainSections = document.querySelectorAll('.main-section');
  const mainTitle = document.getElementById('main-title');
  const tabLinks = document.querySelectorAll('.tab-link');
  
  function showSection(sectionId) {
    mainSections.forEach(sec => sec.classList.remove('active'));
    const sec = document.getElementById(sectionId);
    if (sec) sec.classList.add('active');
    tabLinks.forEach((btn) => {
      const isActive = btn.getAttribute('data-section') === sectionId;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.tabIndex = isActive ? 0 : -1;
    });
    if (mainTitle && sec) {
      const h = sec.querySelector('.card-title span');
      mainTitle.textContent = h ? h.textContent : 'KevStore';
    }
    const headerEl = document.querySelector('.main-header');
    if (headerEl) {
      const headerH = Math.ceil(headerEl.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--header-height', headerH + 'px');
    }
    document.body.classList.add('section-fullscreen');
    if (sectionId === 'caja-section') {
      populateCajaDayInputs();
      actualizarTotalesMedios();
      renderBilletesGrid();
      renderBilletesHistorial();
      actualizarMovimientosCaja();
    }
    if (sectionId === 'historial-section') {
      renderCalendar();
      clearHistorialFilter();
    }
  }
  
  showSection('productos-stock-section');
}
// Backup / Exportar datos
// PDF libraries prefetch support to improve reliability (preload on start and on hover)
let pdfLibsLoading = false;
let pdfLibsLoaded = false;
let pdfLibsFailed = false;
let pdfLibsLoadingPromise = null;

function loadExternalScript(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    try {
      if (document.querySelector(`script[src="${url}"]`)) { resolve(); return; }
    } catch (e) { /* ignore selector errors */ }
    const s = document.createElement('script'); s.src = url; s.async = true;
    let done = false;
    const timer = setTimeout(() => { if (done) return; done = true; reject(new Error('timeout')); }, timeout);
    s.onload = () => { if (done) return; done = true; clearTimeout(timer); resolve(); };
    s.onerror = (e) => { if (done) return; done = true; clearTimeout(timer); reject(new Error('load error')); };
    document.head.appendChild(s);
  });
}

function prefetchPdfLibs() {
  if (pdfLibsLoaded) { console.log('pdf libs already loaded'); return Promise.resolve(true); }
  if (pdfLibsLoading) return pdfLibsLoadingPromise;
  pdfLibsLoading = true;
  showToast('Precargando librerías PDF...', 'success');
  console.log('Prefetching jsPDF+autoTable...');
  pdfLibsLoadingPromise = (async () => {
    try {
      // Try local vendor files first (place them in /libs/)
      try {
        await loadExternalScript('/libs/jspdf.umd.min.js', 8000);
        await loadExternalScript('/libs/jspdf.plugin.autotable.min.js', 8000);
        pdfLibsLoaded = true;
        pdfLibsLoading = false;
        showToast('Librerías PDF locales cargadas', 'success');
        console.log('jsPDF + autoTable loaded from local files');
        if (typeof hidePdfPrepBanner === 'function') hidePdfPrepBanner();
        return true;
      } catch (localErr) {
        console.warn('Local PDF libs not found, falling back to CDN', localErr);
      }
      // Fallback: CDN
      await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 12000);
      await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js', 12000);
      pdfLibsLoaded = true;
      pdfLibsLoading = false;
      showToast('Librerías de PDF cargadas (CDN)', 'success');
      console.log('jsPDF + autoTable loaded (CDN)');
      if (typeof hidePdfPrepBanner === 'function') hidePdfPrepBanner();
      return true;
    } catch (err) {
      pdfLibsFailed = true;
      pdfLibsLoading = false;
      console.error('Prefetch failed', err);
      showToast('No se pudieron cargar las librerías de PDF (se usará JSON)', 'error');
      return false;
    }
  })();
  return pdfLibsLoadingPromise;
}

// Kick-off prefetch on page load (helps Live Server / Go Live case)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { prefetchPdfLibs().catch(()=>{}); });
} else {
  prefetchPdfLibs().catch(()=>{});
}

const btnBackup = document.getElementById('btn-backup');
const btnImport = document.getElementById('btn-import');
const btnExportCsv = document.getElementById('btn-export-csv');
const btnCopyJson = document.getElementById('btn-copy-json');
const btnDownloadJson = document.getElementById('btn-download-json');
const inputImportFile = document.getElementById('input-import-file');

if (btnBackup) btnBackup.addEventListener('click', async () => {
  const pw = prompt('Contraseña para cifrar backup (dejar vacío para no cifrar):', '');
  await exportAppData(Boolean(pw), pw || undefined);
});

if (btnImport && inputImportFile) { btnImport.addEventListener('click', ()=> inputImportFile.click()); inputImportFile.addEventListener('change', ()=> importAppDataFromFile(inputImportFile.files[0])); }

if (btnExportCsv) btnExportCsv.addEventListener('click', exportAllCsv);
if (btnCopyJson) btnCopyJson.addEventListener('click', ()=> copyToClipboard(JSON.stringify({clientes, productos, ventas, cuentas, cajaMovimientos, cajaBilletes, cajaBilletesRegistro}, null, 2)));
// Generar y descargar PDF con jsPDF + autoTable
function handleDownloadClick() {
  // Preguntar si el usuario desea solo los últimos 30 días
  const onlyLast30 = confirm('¿Deseas descargar SOLO los datos de los últimos 30 días? (Aceptar = Sí)');
  showToast(onlyLast30 ? 'Generando archivo (últimos 30 días)...' : 'Generando archivo (todos los datos)...', 'success');

  // Mostrar banner de preparación (permite descargar JSON si es lento)
  try { showPdfPrepBanner(); } catch(e){}

  // Fecha límite (30 días, incluyendo hoy)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 29);
  const isoCutoff = cutoff.toISOString().split('T')[0];

  function inLast30(dateStr) {
    if (!dateStr) return false;
    const d = dateStr.split('T')[0];
    return d >= isoCutoff;
  }

  let data;
  if (onlyLast30) {
    data = {
      clientes: clientes.filter(c => c.fecha && inLast30(c.fecha)),
      productos: productos.filter(p => p.fecha && inLast30(p.fecha)),
      ventas: ventas.filter(v => v.fecha && inLast30(v.fecha)),
      cuentas: cuentas.filter(c => c.fecha && inLast30(c.fecha)),
      cajaMovimientos: cajaMovimientos.filter(m => m.fecha && inLast30(m.fecha)),
      cajaBilletes: cajaBilletes, // mantenemos el snapshot completo (no es temporal)
      cajaBilletesRegistro: cajaBilletesRegistro.filter(r => r.fecha && inLast30(r.fecha))
    };
  } else {
    data = { clientes, productos, ventas, cuentas, cajaMovimientos, cajaBilletes, cajaBilletesRegistro };
  }

  // Exponer una función temporal que permite al banner iniciar la descarga JSON con los datos preparados.
  window._downloadPreparedJson = function() {
    try { hidePdfPrepBanner(); } catch(e){}
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    const nowF = new Date().toISOString().replace(/[:.]/g, '-'); a.download = `datos-${nowF}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 5000);
    showToast('Descarga JSON iniciada', 'success');
    // cleanup
    window._downloadPreparedJson = null;
  };

  function downloadJSON() {
    if (typeof window._downloadPreparedJson === 'function') return window._downloadPreparedJson();
    // fallback
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    const nowF = new Date().toISOString().replace(/[:.]/g, '-'); a.download = `datos-${nowF}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 5000);
    showToast('Descarga JSON iniciada', 'success');
  }

  // Using global loadExternalScript and prefetchPdfLibs (defined globally) to avoid loading late during the click.

  // Robust PDF generation flow with dynamic loader if needed
  (async () => {
    try {
      // detect jsPDF constructor
      let PDFConstructor = null;
      if (window.jspdf && typeof window.jspdf.jsPDF === 'function') PDFConstructor = window.jspdf.jsPDF;
      else if (typeof window.jsPDF === 'function') PDFConstructor = window.jsPDF;
      else if (typeof window.jspdf === 'function') PDFConstructor = window.jspdf;

          // If missing, avoid long async waits that can move the download outside the user gesture
      if (!PDFConstructor) {
        console.warn('jsPDF not available synchronously — initiating immediate JSON download to avoid browser blocking');
        downloadJSON();
        // Start prefetch for future clicks, but don't await it here (keeps download inside user gesture)
        if (!pdfLibsLoaded && !pdfLibsLoading) prefetchPdfLibs().catch(()=>{});
        return;
      }

      if (!PDFConstructor) {
        console.warn('No se pudo cargar jsPDF; descargando JSON en su lugar');
        downloadJSON();
        return;
      }

      // Build PDF
      const doc = new PDFConstructor({ unit: 'pt', format: 'a4' });
      const margin = 40; let cursorY = 48;
      doc.setFontSize(16);
      const title = `Exportación de Datos — ${new Date().toLocaleString()}`;
      doc.text(title, margin, cursorY);
      doc.setFontSize(10); cursorY += 18;

      // small helper to render table or text
      function renderTable(titleLabel, head, body) {
        if (!body || body.length === 0) { doc.text(`${titleLabel}: (ninguno)`, margin, cursorY); cursorY += 14; return; }
        if (typeof doc.autoTable === 'function') {
          doc.autoTable({ startY: cursorY, head: [head], body, theme: 'striped', styles: { fontSize: 9 }, headStyles: { fillColor: [30,64,175] }, margin: { left: margin, right: margin } });
          cursorY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 12 : cursorY + 140;
        } else {
          doc.text(titleLabel + ':', margin, cursorY); cursorY += 12; body.forEach(r => { doc.text(r.map(c => String(c)).join(' | '), margin + 6, cursorY); cursorY += 10; if (cursorY > doc.internal.pageSize.height - margin - 40) { doc.addPage(); cursorY = margin; } }); cursorY += 8;
        }
      }

      // Summary
      const ventasByIdSummary = {};
      data.ventas.forEach((v, idx) => { const id = v.saleId || `venta-${idx+1}`; ventasByIdSummary[id] = ventasByIdSummary[id] || []; ventasByIdSummary[id].push(v); });
      const totalVentasAgrupadas = Object.keys(ventasByIdSummary).length;
      const totalProductosVendidos = data.ventas.reduce((s, v) => s + (parseInt(v.cantidad) || 0), 0);
      const totalsByMethod = { efectivo: 0, tarjeta_credito: 0, tarjeta_debito: 0, qr: 0, transferencia: 0, mercado_pago: 0 };
      let totalIngresos = 0;
      data.ventas.forEach(v => { if (v.pagos && Array.isArray(v.pagos) && v.pagos.length > 0) { v.pagos.forEach(p => { const pm = p.metodo === 'tarjeta' ? 'tarjeta_credito' : p.metodo; totalsByMethod[pm] = (totalsByMethod[pm]||0) + (parseFloat(p.monto)||0); totalIngresos += parseFloat(p.monto)||0; }); } else { const prod = data.productos[v.producto]; const line = (prod ? (parseFloat(prod.precio)||0) : (parseFloat(v.precio)||0)) * (parseInt(v.cantidad)||0); const mp = (v.metodoPago === 'tarjeta') ? 'tarjeta_credito' : (v.metodoPago || 'efectivo'); totalsByMethod[mp] = (totalsByMethod[mp]||0) + line; totalIngresos += line; } }); Object.keys(totalsByMethod).forEach(k => totalsByMethod[k] = Math.round((totalsByMethod[k]||0)*100)/100); totalIngresos = Math.round(totalIngresos*100)/100;
      const summaryHead = ['Métrica','Valor'];
      const summaryBody = [['Ventas (agrupadas)', totalVentasAgrupadas], ['Total ingresos', `$${totalIngresos.toFixed(2)}`], ['Productos vendidos', totalProductosVendidos], ['Clientes registrados', data.clientes.length], [' ', ' '], ['Efectivo', `$${(totalsByMethod.efectivo||0).toFixed(2)}`], ['Tarjeta — Crédito', `$${(totalsByMethod.tarjeta_credito||0).toFixed(2)}`], ['Tarjeta — Débito', `$${(totalsByMethod.tarjeta_debito||0).toFixed(2)}`], ['QR', `$${(totalsByMethod.qr||0).toFixed(2)}`], ['Transferencia', `$${(totalsByMethod.transferencia||0).toFixed(2)}`], ['Mercado Pago', `$${(totalsByMethod.mercado_pago||0).toFixed(2)}`]];
      doc.setFontSize(12); doc.text('Resumen', margin, cursorY); cursorY += 12; renderTable('Resumen', summaryHead, summaryBody);

      // Clientes
      const cliHead = ['#', 'Nombre', 'Contacto', 'Fecha']; const cliBody = data.clientes.map((c,i)=>[i+1, c.nombre||'', (c.telefono||c.email||''), c.fecha||'']); doc.setFontSize(12); doc.text('Clientes', margin, cursorY); cursorY += 12; renderTable('Clientes', cliHead, cliBody);

      // Productos
      const prodHead = ['#','Nombre','Precio','Stock','Código']; const prodBody = data.productos.map((p,i)=>[i+1, p.nombre||'', (typeof p.precio==='number'?`$${p.precio.toFixed(2)}`:p.precio||''), (p.stock!=null?p.stock:p.cantidad||''), p.codigoBarra||p.codigoEspecial||'']); doc.setFontSize(12); doc.text('Productos', margin, cursorY); cursorY += 12; renderTable('Productos', prodHead, prodBody);

      // Ventas
      const ventasHead = ['#','Fecha','Cliente','Total']; const ventasBody = Object.keys(ventasByIdSummary).map((sid, idx) => { const group = ventasByIdSummary[sid]; let total = 0; group.forEach(item=>{ const prod = data.productos[item.producto]; const price = prod ? (prod.precio||0) : (item.precio||0); total += (price * (item.cantidad||1)); }); const fecha = group[0] && (group[0].fecha||''); const clienteIdx = group[0] && group[0].cliente; const clienteName = (typeof clienteIdx === 'number' && data.clientes[clienteIdx]) ? data.clientes[clienteIdx].nombre : (group[0] && group[0].cliente) || ''; return [idx+1, fecha||'', clienteName||'', `$${total.toFixed(2)}`]; }); doc.setFontSize(12); doc.text('Ventas (agrupadas)', margin, cursorY); cursorY += 12; renderTable('Ventas', ventasHead, ventasBody);

      // Cuentas
      const cuentasHead = ['#','Fecha','Cliente','Tipo','Monto']; const cuentasBody = data.cuentas.map((c,i)=>[i+1, c.fecha||'', (c.cliente && (data.clientes[c.cliente]?data.clientes[c.cliente].nombre:c.cliente))||'', c.tipo||'', `$${(parseFloat(c.monto)||0).toFixed(2)}`]); doc.setFontSize(12); doc.text('Cuentas', margin, cursorY); cursorY += 12; renderTable('Cuentas', cuentasHead, cuentasBody);

      // Caja
      const cajaHead = ['#','Fecha','Tipo','Monto','Motivo']; const cajaBody = data.cajaMovimientos.map((m,i)=>[i+1, m.fecha||'', m.tipo||'', `$${(parseFloat(m.monto)||0).toFixed(2)}`, m.motivo||'']); doc.setFontSize(12); doc.text('Movimientos de Caja', margin, cursorY); cursorY += 12; renderTable('CajaMovimientos', cajaHead, cajaBody);

      // Billetes
      const bilHead = ['#','Fecha','Total']; const bilBody = data.cajaBilletesRegistro.map((r,i)=>[i+1, r.fecha||'', `$${(r.total||0).toFixed(2)}`]); doc.setFontSize(12); doc.text('Recuentos de Billetes', margin, cursorY); cursorY += 12; renderTable('Billetes', bilHead, bilBody);

      // Save as blob if possible
      try {
        let pdfBlob = null;
        try { if (typeof doc.output === 'function') pdfBlob = doc.output('blob'); } catch (e) { console.warn('doc.output(blob) failed', e); pdfBlob = null; }
        const now = new Date().toISOString().replace(/[:.]/g, '-'); const filename = `datos-${now}.pdf`;
        if (pdfBlob) { const url = URL.createObjectURL(pdfBlob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 5000); showToast('Descarga PDF iniciada (blob)', 'success'); try { hidePdfPrepBanner(); window._downloadPreparedJson = null; } catch(e) {} }
        else { doc.save(filename); showToast('Descarga PDF iniciada', 'success'); try { hidePdfPrepBanner(); window._downloadPreparedJson = null; } catch(e) {} }
      } catch (e) { console.error('Error al forzar descarga del PDF', e); showToast('No fue posible iniciar la descarga', 'error'); }
    } catch (err) { console.error('Error generando PDF', err); downloadJSON(); }
  })();

}

// Small helpers to show/hide the "Preparando PDF" banner
function showPdfPrepBanner() {
  try {
    const el = document.getElementById('pdf-prep-banner');
    if (!el) return;
    el.hidden = false;
    el.classList.add('loading');
  } catch (e) { }
}
function hidePdfPrepBanner() {
  try {
    const el = document.getElementById('pdf-prep-banner');
    if (!el) return;
    el.hidden = true;
    el.classList.remove('loading');
  } catch (e) { }
}

// Wire up banner buttons after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const btnNow = document.getElementById('pdf-download-json-now');
  const btnClose = document.getElementById('pdf-prep-close');
  if (btnNow) btnNow.addEventListener('click', () => {
    if (typeof window._downloadPreparedJson === 'function') {
      window._downloadPreparedJson();
      hidePdfPrepBanner();
    } else {
      // If no prepared data is available, trigger the main download flow
      if (btnDownloadJson) btnDownloadJson.click();
    }
  });
  if (btnClose) btnClose.addEventListener('click', hidePdfPrepBanner);
});

// Attach handler (direct or delegated if element not present yet)
if (btnDownloadJson) {
  console.log('Attaching download handler to #btn-download-json');
  btnDownloadJson.addEventListener('click', handleDownloadClick);
  // Preload pdf libs proactively on hover/focus/pointerdown to ensure downloads are initiated within user gesture
  btnDownloadJson.addEventListener('pointerenter', () => prefetchPdfLibs().catch(()=>{}), { passive: true });
  btnDownloadJson.addEventListener('focus', () => prefetchPdfLibs().catch(()=>{}));
  btnDownloadJson.addEventListener('pointerdown', () => prefetchPdfLibs().catch(()=>{}));
} else {
  console.log('Download button not found at script load; using delegated listener');
  document.body.addEventListener('click', (e) => { if (e.target && e.target.closest && e.target.closest('#btn-download-json')) { console.log('Delegated click caught for download button'); handleDownloadClick(); } });
}

// Debug: global click logger for the download button to help troubleshooting
document.addEventListener('click', (e) => {
  try {
    const target = e.target && e.target.closest && e.target.closest('#btn-download-json');
    if (target) console.log('DEBUG: Clicked #btn-download-json element', target);
  } catch (e) {}
});

// Expose showMainApp to window for auth.js to call after login
window.showMainApp = showMainApp;

// Función para limpiar datos de la app (usada por el sistema de autenticación)
window.clearAppData = function() {
  clientes = [];
  productos = [];
  ventas = [];
  cuentas = [];
  cajaMovimientos = [];
  cajaBilletes = {};
  cajaBilletesRegistro = [];
  DENOMINACIONES.forEach(d => cajaBilletes[d] = 0);
  
  // Limpiar UI
  if (typeof actualizarListaClientes === 'function') actualizarListaClientes();
  if (typeof actualizarListaProductosYStock === 'function') actualizarListaProductosYStock();
  if (typeof actualizarListaVentas === 'function') actualizarListaVentas();
  if (typeof actualizarResumenCuentas === 'function') actualizarResumenCuentas();
  if (typeof actualizarMovimientosCaja === 'function') actualizarMovimientosCaja();
  
  console.log('Datos de la app limpiados');
};
