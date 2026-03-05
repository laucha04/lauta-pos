const { test, expect } = require('@playwright/test');
const path = require('path');

// Adjust this URL to match the static server you run locally (see README)
const BASE = process.env.TEST_BASE_URL || 'http://localhost:8000';

test.describe('KevStore UI - basic flows', () => {
  test('add a client and select it', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);

    // go to Cuentas and add a new client (Clients are now managed inside Cuentas)
    await page.click('.tab-link[data-section="cuentas-section"]');
    await page.fill('#cliente-nombre', 'PlaywrightUser');
    await page.click('button:has-text("Agregar Cliente")');

    // toast should show success
    await expect(page.locator('.toast .toast-text')).toHaveText(/PlaywrightUser/);

    // check that the client appears in the list
    await expect(page.locator('#lista-clientes')).toContainText('PlaywrightUser');

    // click Seleccionar for first client row
    const selectBtn = page.locator('#lista-clientes .select-client').first();
    await selectBtn.click();

    // cuenta select should be set to 0 (first option)
    await expect(page.locator('#cuenta-cliente')).toHaveValue('0');
  });

  test('delete client and undo from toast', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);

    // ensure a client exists (clients now managed inside Cuentas)
    await page.click('.tab-link[data-section="cuentas-section"]');
    await page.fill('#cliente-nombre', 'TempUser');
    await page.click('button:has-text("Agregar Cliente")');
    await expect(page.locator('#lista-clientes')).toContainText('TempUser');

    // delete (click delete)
    await page.click('#lista-clientes .delete-client');

    // confirm modal should appear
    await expect(page.locator('#confirm-modal[aria-hidden="false"]')).toBeVisible();
    await page.click('#confirm-ok');

    // we expect an undo-capable toast
    const undoActionBtn = page.locator('.toast .toast-action');
    await expect(undoActionBtn).toBeVisible();

    // click undo
    await undoActionBtn.click();

    // TempUser should be back in list
    await expect(page.locator('#lista-clientes')).toContainText('TempUser');
  });

  test('assign barcode to product and scanner adds to sale', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);

    // add a product
    await page.fill('#producto-nombre', 'ProdScanTest');
    await page.fill('#producto-precio', '9.99');
    await page.fill('#producto-stock', '10');
    await page.click('button:has-text("Agregar Producto")');

    // Wait for it to appear in the products list
    await expect(page.locator('#lista-productos-stock')).toContainText('ProdScanTest');

    // assign barcode directly at product creation form
    const code = '123456789012';
    await page.fill('#producto-codigo', code);
    // click add again already clicked earlier — ensure barcode is present when creating
    // In our test, we created the product with the fields filled; since we added the barcode afterwards, we need to add sync by filling it and checking state on the new product.
    // For robust test, create a second product with barcode using the create form
    await page.fill('#producto-nombre', 'ProdScanTest2');
    await page.fill('#producto-precio', '5.99');
    await page.fill('#producto-stock', '8');
    await page.fill('#producto-codigo', code);
    await page.click('button:has-text("Agregar Producto")');

    // ensure JS state has the barcode set for the first product
    // ensure classifier saved barcode on one of the products
    const found = await page.evaluate((c) => {
      const prod = window.productos || [];
      return prod.some(p => p.codigoBarra === c);
    }, code);
    expect(found).toBeTruthy();

    // navigate to Ventas and make sure scanning the code (keyboard emulation) adds product to sale
    await page.click('.tab-link[data-section="ventas-section"]');

    // Focus body and simulate a fast scan (type + Enter)
    await page.focus('body');
    await page.keyboard.type(code);
    await page.keyboard.press('Enter');

    // allow a short delay for the app to update
    await page.waitForTimeout(200);

    // The sale products container should contain a product row with the scanned product (ProdScanTest2)
    const saleRow = await page.locator('.producto-venta-item').first();
    await expect(saleRow).toContainText('ProdScanTest2');
  });

  test('productos sin codigo reciben codigo especial y se detectan', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    // add a product without entering a barcode
    await page.fill('#producto-nombre', 'NoCodeProd');
    await page.fill('#producto-precio', '12.00');
    await page.fill('#producto-stock', '5');
    // Ensure codigo field is empty
    await page.fill('#producto-codigo', '');
    await page.click('button:has-text("Agregar Producto")');

    // Product object should have a codigoEspecial assigned
    const specialCode = await page.evaluate(() => {
      const prod = window.productos || [];
      const p = prod.find(p => p.nombre === 'NoCodeProd');
      return p ? p.codigoEspecial : null;
    });
    expect(specialCode).toBeTruthy();

    // The product list should display the special code in the readonly input and have a copy button
    await expect(page.locator('.input-codigo-especial')).toHaveValue(specialCode);
    await expect(page.locator('.btn-copy-codigo-especial')).toBeVisible();

    // Clicking the copy button should trigger a copy toast
    await page.click('.btn-copy-codigo-especial');
    await page.waitForSelector('.toasts .toast', { timeout: 1500 });
    await expect(page.locator('.toasts .toast').first()).toContainText('Código copiado al portapapeles');

    // Simulate scanner input: type the special code and press Enter
    await page.click('.tab-link[data-section="ventas-section"]');
    await page.focus('body');
    await page.keyboard.type(specialCode);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // The sale products container should contain a product row with the scanned product
    const saleRow = await page.locator('.producto-venta-item').first();
    await expect(saleRow).toContainText('NoCodeProd');
  });

  test('caja: retirar efectivo y actualizar total', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    // ensure we have a client (create from Cuentas)
    await page.click('.tab-link[data-section="cuentas-section"]');
    await page.fill('#cliente-nombre', 'CajaClient');
    await page.click('button:has-text("Agregar Cliente")');
    // add a product with price 100 and stock
    await page.fill('#producto-nombre', 'CajaProd');
    await page.fill('#producto-precio', '100.00');
    await page.fill('#producto-stock', '5');
    await page.click('button:has-text("Agregar Producto")');

    // Make a sale with efectivo
    await page.click('.tab-link[data-section="ventas-section"]');
    const select = page.locator('.venta-producto').first();
    await select.selectOption('0');
    await page.fill('.venta-cantidad', '1');
    await page.fill('#venta-fecha', new Date().toISOString().split('T')[0]);
    await page.selectOption('#venta-metodo-pago', 'efectivo');
    await page.click('#btn-registrar-venta');

    // go to caja section and set billetes counts to register physical cash and get total
    await page.click('.tab-link[data-section="caja-section"]');
    // set billetes manually to cover the 100 ARS
    await page.fill('#billete-100', '1');
    await page.click('#guardar-billetes');
    const totalText = await page.locator('#caja-total').textContent();
    // expect totalText to contain 100.00
    await expect(totalText).toContain('$100.00');

    // Register a retiro of 100 with reason 'test retiro'
    await page.fill('#caja-monto', '100');
    await page.fill('#caja-motivo', 'test retiro');
    await page.click('#form-caja button[type="submit"]');
    // allow for update
    await page.waitForTimeout(100);

    // total should be 0.00 now (100 - 100 withdrawn)
    const totalTextAfter = await page.locator('#caja-total').textContent();
    await expect(totalTextAfter).toContain('$0.00');
    // check movimientos list contains 'test retiro'
    await expect(page.locator('#movimientos-caja')).toContainText('test retiro');
    // check billete count was decremented accordingly (we used 100 bills; after withdrawing 100 should be 0)
    const b100 = await page.locator('#billete-100').inputValue();
    await expect(b100).toBe('0');
  });

  test('caja: recuento billetes actualiza total', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    await page.click('.tab-link[data-section="caja-section"]');
    // set some billetes
    await page.fill('#billete-100', '2');
    await page.fill('#billete-200', '1');
    await page.fill('#billete-500', '1');
    await page.click('#guardar-billetes');
    // small delay to let UI update
    await page.waitForTimeout(120);
    const totalText = await page.locator('#caja-total').textContent();
    await expect(totalText).toContain('$900.00');
  });

  test('caja: guardar recuento crea historial diario', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    // Create products and sales that will be auto-registered into the caja snapshot
    await page.click('.tab-link[data-section="cuentas-section"]');
    // Tarjeta product
    await page.fill('#producto-nombre', 'TarjProd');
    await page.fill('#producto-precio', '50.00');
    await page.fill('#producto-stock', '5');
    await page.click('button:has-text("Agregar Producto")');
    // Transferencia product
    await page.fill('#producto-nombre', 'TranProd');
    await page.fill('#producto-precio', '20.00');
    await page.fill('#producto-stock', '5');
    await page.click('button:has-text("Agregar Producto")');
    // Mercado Pago product
    await page.fill('#producto-nombre', 'MercProd');



    // Mercado Pago product
    await page.fill('#producto-precio', '10.00');
    await page.fill('#producto-stock', '5');
    await page.click('button:has-text("Agregar Producto")');

    // Register ventas for today with different medios
    await page.click('.tab-link[data-section="ventas-section"]');
    const today = new Date().toISOString().split('T')[0];
    // tarjeta 50 (registro como tarjeta_credito por defecto)
    await page.selectOption('.venta-producto', '0');
    await page.fill('.venta-cantidad', '1');
    await page.fill('#venta-fecha', today);
    await page.selectOption('#venta-metodo-pago', 'tarjeta_credito');
    await page.click('#btn-registrar-venta');
    // transferencia 20
    await page.selectOption('.venta-producto', '1');
    await page.fill('.venta-cantidad', '1');
    await page.fill('#venta-fecha', today);
    await page.selectOption('#venta-metodo-pago', 'transferencia');
    await page.click('#btn-registrar-venta');
    // mercado_pago 10
    await page.selectOption('.venta-producto', '2');
    await page.fill('.venta-cantidad', '1');
    await page.fill('#venta-fecha', today);
    await page.selectOption('#venta-metodo-pago', 'mercado_pago');
    await page.click('#btn-registrar-venta');

    // Now go to caja, set billetes and save snapshot (non-cash totals will be computed from ventas)
    await page.click('.tab-link[data-section="caja-section"]');
    // set billetes counts
    await page.fill('#billete-100', '2');
    await page.fill('#billete-200', '1');
    await page.click('#guardar-billetes');
    await page.waitForTimeout(120);
    // expect historial to show today's date and the total (2*100 + 1*200 = 400)
    // today variable set earlier
    await expect(page.locator('#caja-billetes-historial')).toContainText(today);
    await expect(page.locator('#caja-billetes-historial')).toContainText('$400.00');
    // check the listing shows the non-cash totals
    await expect(page.locator('#caja-billetes-historial')).toContainText('Tarjeta Crédito: $50.00');
    await expect(page.locator('#caja-billetes-historial')).toContainText('Transferencia: $20.00');
    await expect(page.locator('#caja-billetes-historial')).toContainText('Mercado Pago: $10.00');
    // expand details and verify they are shown
    const detailBtn = page.locator('#caja-billetes-historial .btn-detalle').first();
    await detailBtn.click();
    await expect(page.locator('#caja-billetes-historial')).toContainText('Efectivo total: $400.00');
  });

  test('cuentas: cargo con producto registra deuda y descuenta stock', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    // add client
    await page.click('.tab-link[data-section="cuentas-section"]');
    await page.fill('#cliente-nombre', 'CuentaProdClient');
    await page.click('button:has-text("Agregar Cliente")');
    // add product
    await page.fill('#producto-nombre', 'CuentaProd');
    await page.fill('#producto-precio', '80.00');
    await page.fill('#producto-stock', '3');
    await page.click('button:has-text("Agregar Producto")');

    // go to cuentas
    // client should already be in the list and selected by the test
    await page.selectOption('#cuenta-cliente', '0');
    // select product and set quantity 2 (monto should be auto-calculated)
    await page.selectOption('#cuenta-producto', '0');
    await page.fill('#cuenta-producto-cantidad', '2');
    // ensure monto was auto-calculated and readonly
    await page.waitForTimeout(120);
    await expect(page.locator('#cuenta-monto')).toHaveValue('160.00');
    await expect(await page.locator('#cuenta-monto').getAttribute('readonly')).not.toBeNull();
    await page.selectOption('#cuenta-tipo', 'cargo');
    await page.click('button:has-text("Registrar movimiento")');
    await page.waitForTimeout(200);

    // resumen cuentas should show the product and amount
    await expect(page.locator('#resumen-cuentas')).toContainText('CuentaProd');
    await expect(page.locator('#resumen-cuentas')).toContainText('$160.00');
    // should also show aggregated owed products for the client
    await expect(page.locator('#resumen-cuentas')).toContainText('CuentaProd x2');
    // owed badge should be present
    await expect(page.locator('.owed-badge')).toBeVisible();

    // product stock should be decremented (from 3 to 1)
    await page.click('.tab-link[data-section="productos-stock-section"]');
    await expect(page.locator('#lista-productos-stock')).toContainText('Stock: 1');
  });

  test('caja: totales por medios actualiza con ventas', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    // add client and two products
    await page.click('.tab-link[data-section="cuentas-section"]');
    await page.fill('#cliente-nombre', 'MedioClient');
    await page.click('button:has-text("Agregar Cliente")');
    await page.fill('#producto-nombre', 'TarjProd');
    await page.fill('#producto-precio', '150.00');
    await page.fill('#producto-stock', '5');
    await page.click('button:has-text("Agregar Producto")');
    await page.fill('#producto-nombre', 'TranProd');
    await page.fill('#producto-precio', '70.00');
    await page.fill('#producto-stock', '5');
    await page.click('button:has-text("Agregar Producto")');

    // registro de venta tarjeta 150
    await page.click('.tab-link[data-section="ventas-section"]');
    await page.selectOption('.venta-producto', '0');
    await page.fill('.venta-cantidad', '1');
    await page.fill('#venta-fecha', new Date().toISOString().split('T')[0]);
    await page.selectOption('#venta-metodo-pago', 'tarjeta_credito');
    await page.click('#btn-registrar-venta');
    // venta transferencia 70
    await page.selectOption('.venta-producto', '1');
    await page.fill('.venta-cantidad', '1');
    await page.selectOption('#venta-metodo-pago', 'transferencia');
    await page.click('#btn-registrar-venta');
    // venta mercado pago 20 via split
    await page.click('#btn-agregar-producto');
    await page.selectOption('.venta-producto', '1');
    await page.fill('.venta-cantidad', '1');
    await page.check('#venta-pago-dividido');
    // create two parts, mercadoPago 20, tarjeta 50
    await page.click('#venta-agregar-parte');
    await page.click('#venta-agregar-parte');
    const parts = await page.locator('.venta-pago-parte');
    await parts.nth(0).locator('.venta-pago-metodo').selectOption('mercado_pago');
    await parts.nth(0).locator('.venta-pago-monto').fill('20');
    await parts.nth(1).locator('.venta-pago-metodo').selectOption('tarjeta_credito');
    await parts.nth(1).locator('.venta-pago-monto').fill('50');
    await page.click('#btn-registrar-venta');

    // navigate to caja and check totals
    await page.click('.tab-link[data-section="caja-section"]');
    // Tarjeta Crédito should be 150 + 50 = 200
    await expect(page.locator('#caja-total-tarjeta-credito')).toContainText('$200.00');
    // Transferencia should be 70
    await expect(page.locator('#caja-total-transferencia')).toContainText('$70.00');
    // Mercado Pago should be 20
    await expect(page.locator('#caja-total-mercado')).toContainText('$20.00');
  });

  test('venta dividido: registra ambos pagos y caja muestra efectivo parcial', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    // add client and product
    await page.fill('#cliente-nombre', 'SplitClient');
    await page.click('button:has-text("Agregar Cliente")');
    await page.fill('#producto-nombre', 'SplitProd');
    await page.fill('#producto-precio', '200.00');
    await page.fill('#producto-stock', '10');
    await page.click('button:has-text("Agregar Producto")');

    // go to ventas
    await page.click('.tab-link[data-section="ventas-section"]');
    // add product row and set selection
    await page.selectOption('.venta-producto', '0');
    await page.fill('.venta-cantidad', '1');
    await page.fill('#venta-fecha', new Date().toISOString().split('T')[0]);
    // enable split payment
    await page.check('#venta-pago-dividido');
    // with split enabled the primary method selection should not be required or visible
    await expect(page.locator('#venta-metodo-pago')).toBeHidden();
    // A dynamic UI appears; add two parts and set them
    await page.click('#venta-agregar-parte');
    await page.click('#venta-agregar-parte');
    const parts = await page.locator('.venta-pago-parte');
    // set first part (index 0)
    await parts.nth(0).locator('.venta-pago-metodo').selectOption('efectivo');
    await parts.nth(0).locator('.venta-pago-monto').fill('120');
    // set second part (index 1)
    await parts.nth(1).locator('.venta-pago-metodo').selectOption('tarjeta_credito');
    await parts.nth(1).locator('.venta-pago-monto').fill('80');
    // Register sale
    await page.click('#btn-registrar-venta');
    // allow updates
    await page.waitForTimeout(200);
    // Check historial ventas shows split payment breakdown
    await page.click('.tab-link[data-section="historial-section"]');
    await expect(page.locator('#historial-ventas')).toContainText('efectivo: $120.00');
    await expect(page.locator('#historial-ventas')).toContainText('tarjeta_credito: $80.00');
    // Check caja (sub) shows efectivo total 120.00
    await page.click('.tab-link[data-section="caja-section"]');
    await expect(page.locator('#caja-total').locator('.. .caja-sub')).toContainText('Efectivo (ventas): $120.00');
  });

  test('venta con 3 partes: se registran y caja incrementa billetes', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    await page.fill('#cliente-nombre', '3partsClient');
    await page.click('button:has-text("Agregar Cliente")');
    await page.fill('#producto-nombre', 'TriProd');
    await page.fill('#producto-precio', '200.00');
    await page.fill('#producto-stock', '10');
    await page.click('button:has-text("Agregar Producto")');
    await page.click('.tab-link[data-section="ventas-section"]');
    await page.selectOption('.venta-producto', '0');
    await page.fill('.venta-cantidad', '1');
    await page.fill('#venta-fecha', new Date().toISOString().split('T')[0]);
    await page.check('#venta-pago-dividido');
    // create three parts
    await page.click('#venta-agregar-parte');
    await page.click('#venta-agregar-parte');
    await page.click('#venta-agregar-parte');
    const parts3 = await page.locator('.venta-pago-parte');
    // set them: efectivo 100, tarjeta_credito 50, transferencia 50 (total 200)
    await parts3.nth(0).locator('.venta-pago-metodo').selectOption('efectivo');
    await parts3.nth(0).locator('.venta-pago-monto').fill('100');
    await parts3.nth(1).locator('.venta-pago-metodo').selectOption('tarjeta_credito');
    await parts3.nth(1).locator('.venta-pago-monto').fill('50');
    await parts3.nth(2).locator('.venta-pago-metodo').selectOption('transferencia');
    await parts3.nth(2).locator('.venta-pago-monto').fill('50');
    await page.click('#btn-registrar-venta');
    await page.waitForTimeout(300);
    // check caja total shows efectivo ventas 100
    await page.click('.tab-link[data-section="caja-section"]');
    await expect(page.locator('#caja-total').locator('.. .caja-sub')).toContainText('Efectivo (ventas): $100.00');
    // If decomposition, expect billete count to reflect 100 ARS bill
    await expect(page.locator('#billete-100')).toHaveValue('1');
  });

  test('venta manual allocation per product', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    await page.fill('#cliente-nombre', 'ManualClient');
    await page.click('button:has-text("Agregar Cliente")');
    // create two products
    await page.fill('#producto-nombre', 'M1');
    await page.fill('#producto-precio', '100.00');
    await page.fill('#producto-stock', '10');
    await page.click('button:has-text("Agregar Producto")');
    await page.fill('#producto-nombre', 'M2');
    await page.fill('#producto-precio', '100.00');
    await page.fill('#producto-stock', '5');
    await page.click('button:has-text("Agregar Producto")');
    // compose sale with two items
    await page.click('.tab-link[data-section="ventas-section"]');
    // add second product row
    await page.click('#btn-agregar-producto');
    const selects = await page.locator('.venta-producto');
    await selects.nth(0).selectOption('0');
    await selects.nth(1).selectOption('1');
    // set quantities
    const qtys = await page.locator('.venta-cantidad');
    await qtys.nth(0).fill('1');
    await qtys.nth(1).fill('1');
    await page.fill('#venta-fecha', new Date().toISOString().split('T')[0]);
    // split payment with two parts
    await page.check('#venta-pago-dividido');
    await page.click('#venta-agregar-parte');
    await page.click('#venta-agregar-parte');
    const partsMa = await page.locator('.venta-pago-parte');
    await partsMa.nth(0).locator('.venta-pago-metodo').selectOption('efectivo');
    await partsMa.nth(0).locator('.venta-pago-monto').fill('120');
    await partsMa.nth(1).locator('.venta-pago-metodo').selectOption('tarjeta_credito');
    await partsMa.nth(1).locator('.venta-pago-monto').fill('80');
    // enable manual allocation
    await page.check('#venta-manual-asignacion');
    // find manual allocation inputs; there are 2 products and 2 parts -> 4 inputs
    const manualInputs = await page.locator('.producto-asignacion-input');
    // assign for product0: efectivo 100, tarjeta_credito 0
    await manualInputs.nth(0).fill('100'); // prod0 part0 (efectivo)
    await manualInputs.nth(1).fill('0');   // prod0 part1 (tarjeta)
    // product1: efectivo 20, tarjeta 80
    await manualInputs.nth(2).fill('20');  // prod1 part0
    await manualInputs.nth(3).fill('80');  // prod1 part1
    await page.click('#btn-registrar-venta');
    await page.waitForTimeout(200);
    await page.click('.tab-link[data-section="historial-section"]');
    // verify the historial shows allocations for both payment methods
    await expect(page.locator('#historial-ventas')).toContainText('efectivo: $100.00');
    await expect(page.locator('#historial-ventas')).toContainText('efectivo: $20.00');
    await expect(page.locator('#historial-ventas')).toContainText('tarjeta_credito: $80.00');
  });

  test('cuentas: manual client name creates client and selects it', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    // create a product to charge
    await page.fill('#producto-nombre', 'ManualCProd');
    await page.fill('#producto-precio', '50.00');
    await page.fill('#producto-stock', '5');
    await page.click('button:has-text("Agregar Producto")');

    // go to cuentas and submit a cargo with a manual client name
    await page.click('.tab-link[data-section="cuentas-section"]');
    await page.fill('#cuenta-nombre', 'ClienteDeudor');
    await page.selectOption('#cuenta-producto', '0');
    await page.fill('#cuenta-producto-cantidad', '1');
    await page.selectOption('#cuenta-tipo', 'cargo');
    await page.click('button:has-text("Registrar movimiento")');
    await page.waitForTimeout(200);

    // client should be present in the clients list
    await expect(page.locator('#lista-clientes')).toContainText('ClienteDeudor');

    // verify the movement was recorded with that client
    const matches = await page.evaluate(() => {
      const clientes = window.clientes || [];
      const cuentas = window.cuentas || [];
      const last = cuentas[cuentas.length - 1];
      return {
        clientExists: clientes.some(c => c.nombre === 'ClienteDeudor'),
        lastClientName: clientes[last.cliente] ? clientes[last.cliente].nombre : null
      };
    });
    expect(matches.clientExists).toBeTruthy();
    expect(matches.lastClientName).toBe('ClienteDeudor');
  });

  test('cuentas: buscar y seleccionar cliente por nombre', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    await page.click('.tab-link[data-section="cuentas-section"]');
    await page.fill('#cliente-nombre', 'BuscarUser');
    await page.click('button:has-text("Agregar Cliente")');
    // ensure it appears in the list
    await expect(page.locator('#lista-clientes')).toContainText('BuscarUser');
    // search by name and press Enter to select first match
    await page.fill('#buscar-cliente', 'Buscar');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(120);
    // The cuenta select should update and resumen should show the selected client's name
    await expect(page.locator('#cuenta-cliente')).toHaveValue('0');
    await expect(page.locator('#resumen-cuentas')).toContainText('BuscarUser');
  });

  test('venta metodo pago not required when split payment active', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    // Setup: add client and product (clients managed in Cuentas)
    await page.click('.tab-link[data-section="cuentas-section"]');
    await page.fill('#cliente-nombre', 'ReqCheckClient');
    await page.click('button:has-text("Agregar Cliente")');
    await page.fill('#producto-nombre', 'ReqProd');
    await page.fill('#producto-precio', '50.00');
    await page.fill('#producto-stock', '10');
    await page.click('button:has-text("Agregar Producto")');

    // Go to ventas and ready product row without selecting a primary payment method
    await page.click('.tab-link[data-section="ventas-section"]');
    const sel = page.locator('.venta-producto').first();
    await sel.selectOption('0');
    await page.fill('.venta-cantidad', '1');
    await page.fill('#venta-fecha', new Date().toISOString().split('T')[0]);

    // Non-split case: primary method is required — try to submit without selecting it
    await page.click('#btn-registrar-venta');
    await page.waitForTimeout(120);
    // Should show toast error (no payment method selected)
    await expect(page.locator('.toast .toast-text')).toContainText(/Debe indicar fecha y método de pago/);

    // Now enable split payment — this should hide/disable the primary select and allow submit
    await page.check('#venta-pago-dividido');
    // add 2 parts sufficient to pay 50
    await page.click('#venta-agregar-parte');
    await page.click('#venta-agregar-parte');
    const parts = await page.locator('.venta-pago-parte');
    await parts.nth(0).locator('.venta-pago-metodo').selectOption('efectivo');
    await parts.nth(0).locator('.venta-pago-monto').fill('30');
    await parts.nth(1).locator('.venta-pago-metodo').selectOption('tarjeta_credito');
    await parts.nth(1).locator('.venta-pago-monto').fill('20');

    await expect(page.locator('#venta-metodo-pago')).toBeHidden();

    // Submit the sale without selecting primary method — it should work (no required enforcement)
    await page.click('#btn-registrar-venta');
    await page.waitForTimeout(200);
    // Now the historial should contain the payment entries
    await page.click('.tab-link[data-section="historial-section"]');
    await expect(page.locator('#historial-ventas')).toContainText('efectivo: $30.00');
    await expect(page.locator('#historial-ventas')).toContainText('tarjeta_credito: $20.00');
  });

  test('venta without client registers and shows (Sin cliente)', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    // add a product
    await page.fill('#producto-nombre', 'NoClientProd');
    await page.fill('#producto-precio', '30.00');
    await page.fill('#producto-stock', '10');
    await page.click('button:has-text("Agregar Producto")');

    // create a sale without selecting any client
    await page.click('.tab-link[data-section="ventas-section"]');
    await page.selectOption('.venta-producto', '0');
    await page.fill('.venta-cantidad', '1');
    await page.fill('#venta-fecha', new Date().toISOString().split('T')[0]);
    await page.selectOption('#venta-metodo-pago', 'efectivo');
    await page.click('#btn-registrar-venta');
    await page.waitForTimeout(200);

    // historial should show '(Sin cliente)' for this sale
    await page.click('.tab-link[data-section="historial-section"]');
    await expect(page.locator('#historial-ventas')).toContainText('(Sin cliente)');
  });

  // New test: ventas search finds and selects products by name and code
  test('ventas: search product by name and code selects product', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    // create a product with code
    await page.click('.tab-link[data-section="cuentas-section"]');
    await page.fill('#producto-nombre', 'BuscarPr');
    await page.fill('#producto-precio', '11.11');
    await page.fill('#producto-stock', '5');
    await page.fill('#producto-codigo', 'CODE123');
    await page.click('button:has-text("Agregar Producto")');
    // go to Ventas and search by name
    await page.click('.tab-link[data-section="ventas-section"]');
    await page.fill('#venta-buscar-producto', 'BuscarPr');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(120);
    const selectedText = await page.locator('.producto-venta-item .venta-producto').first().evaluate(s => s.options[s.selectedIndex].text);
    await expect(selectedText).toContain('BuscarPr');
    // now search by code
    await page.fill('#venta-buscar-producto', 'CODE123');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(120);
    const selectedText2 = await page.locator('.producto-venta-item .venta-producto').first().evaluate(s => s.options[s.selectedIndex].text);
    await expect(selectedText2).toContain('BuscarPr');

    // Now add a second product and ensure both persist when selected via search
    // create second product
    await page.click('.tab-link[data-section="cuentas-section"]');
    await page.fill('#producto-nombre', 'BuscarPr2');
    await page.fill('#producto-precio', '22.22');
    await page.fill('#producto-stock', '5');
    await page.fill('#producto-codigo', 'CODE456');
    await page.click('button:has-text("Agregar Producto")');
    // back to ventas, select first (BuscarPr) again, then select second (BuscarPr2) — both should be present
    await page.click('.tab-link[data-section="ventas-section"]');
    await page.fill('#venta-buscar-producto', 'BuscarPr');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(120);
    await page.fill('#venta-buscar-producto', 'BuscarPr2');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(120);
    // there should be two rows (or more) and both products selected in order
    const selects = await page.locator('.producto-venta-item .venta-producto');
    const sel0 = await selects.nth(0).evaluate(s => s.options[s.selectedIndex].text);
    const sel1 = await selects.nth(1).evaluate(s => s.options[s.selectedIndex].text);
    await expect(sel0).toContain('BuscarPr');
    await expect(sel1).toContain('BuscarPr2');
  });

  // New test: historial grouped sale card and toggle details
  test('historial: grouped sale card shows items and toggles details', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    const today = new Date().toISOString().split('T')[0];
    // create two products
    await page.click('.tab-link[data-section="cuentas-section"]');
    await page.fill('#producto-nombre', 'GroupA');
    await page.fill('#producto-precio', '10.00');
    await page.fill('#producto-stock', '5');
    await page.click('button:has-text("Agregar Producto")');
    await page.fill('#producto-nombre', 'GroupB');
    await page.fill('#producto-precio', '5.00');
    await page.fill('#producto-stock', '5');
    await page.click('button:has-text("Agregar Producto")');
    // create a sale with both products
    await page.click('.tab-link[data-section="ventas-section"]');
    // select first product
    await page.selectOption('.venta-producto', '0');
    await page.fill('.venta-cantidad', '1');
    // add another product and select second
    await page.click('#btn-agregar-producto');
    const selects = await page.locator('.producto-venta-item .venta-producto');
    await selects.nth(1).selectOption('1');
    await page.fill('#venta-fecha', today);
    await page.selectOption('#venta-metodo-pago', 'efectivo');
    await page.click('#btn-registrar-venta');
    await page.waitForTimeout(120);
    // open historial and check for single sale-card for that date
    await page.click('.tab-link[data-section="historial-section"]');
    // there should be at least one .sale-card and it should contain 'GroupA' and 'GroupB' in the details when toggled
    const saleCard = page.locator('#historial-ventas .sale-card').first();
    await expect(saleCard).toBeVisible();
    await expect(saleCard).toContainText('GroupA');
    await expect(saleCard).toContainText('GroupB');
    // details are hidden initially; click toggle to show details
    const toggle = saleCard.locator('.sale-toggle');
    await toggle.click();
    await expect(saleCard.locator('.sale-details')).toBeVisible();
    // click again to hide
    await toggle.click();
    await expect(saleCard.locator('.sale-details')).toBeHidden();
  });

  // New test: historial calendar filters by date
  test('historial: calendar shows entries and filters by date', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    const today = new Date().toISOString().split('T')[0];
    // create a product
    await page.click('.tab-link[data-section="cuentas-section"]');
    await page.fill('#producto-nombre', 'HistProd');
    await page.fill('#producto-precio', '33.00');
    await page.fill('#producto-stock', '5');
    await page.click('button:has-text("Agregar Producto")');
    // create a sale for today
    await page.click('.tab-link[data-section="ventas-section"]');
    await page.selectOption('.venta-producto', '0');
    await page.fill('.venta-cantidad', '1');
    await page.fill('#venta-fecha', today);
    await page.selectOption('#venta-metodo-pago', 'efectivo');
    await page.click('#btn-registrar-venta');
    // open historial and filter to today
    await page.click('.tab-link[data-section="historial-section"]');
    await page.click('#historial-filter-today');
    // calendar should be present
    await expect(page.locator('#historial-calendar .calendar-grid')).toBeVisible();
    // ventas list should include our product 'HistProd'
    await expect(page.locator('#historial-ventas')).toContainText('HistProd');
  });

  // New test: historial calendar groups multi-product sales when filtering by date
  test('historial: calendar groups multi-product sales for a selected date', async ({ page }) => {
    await page.goto(`${BASE}/index.html`);
    const today = new Date().toISOString().split('T')[0];
    // create two products
    await page.click('.tab-link[data-section="cuentas-section"]');
    await page.fill('#producto-nombre', 'MultiA');
    await page.fill('#producto-precio', '10.00');
    await page.fill('#producto-stock', '5');
    await page.click('button:has-text("Agregar Producto")');
    await page.fill('#producto-nombre', 'MultiB');
    await page.fill('#producto-precio', '5.00');
    await page.fill('#producto-stock', '5');
    await page.click('button:has-text("Agregar Producto")');

    // create a sale that contains both products
    await page.click('.tab-link[data-section="ventas-section"]');
    // select first product in the first row
    await page.selectOption('.venta-producto', '0');
    await page.fill('.venta-cantidad', '1');
    // add second product row and select the second product
    await page.click('#btn-agregar-producto');
    const selects = await page.locator('.producto-venta-item .venta-producto');
    await selects.nth(1).selectOption('1');
    await page.fill('#venta-fecha', today);
    await page.selectOption('#venta-metodo-pago', 'efectivo');
    await page.click('#btn-registrar-venta');

    // open historial, filter to today using the calendar 'Hoy' button
    await page.click('.tab-link[data-section="historial-section"]');
    await page.click('#historial-filter-today');
    // there should be a single .sale-card, and it should contain both product names
    const saleCard = page.locator('#historial-ventas .sale-card').first();
    await expect(saleCard).toBeVisible();
    await expect(saleCard).toContainText('MultiA');
    await expect(saleCard).toContainText('MultiB');
    // toggle details to ensure items are visible when expanded
    const toggle = saleCard.locator('.sale-toggle');
    await toggle.click();
    await expect(saleCard.locator('.sale-details')).toBeVisible();
  });

});
