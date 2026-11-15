import { randomUUID, randomInt } from 'node:crypto'
import QRCode from 'qrcode'

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }) }
const text = (value, max = 200, required = false) => typeof value === 'string' && value.length <= max && (!required || value.trim())
const units = value => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1000000 || Math.abs(value * 1000 - Math.round(value * 1000)) > 0.00001) fail('Usa una cantidad positiva de hasta tres decimales.')
  return Math.round(value * 1000)
}
const serialize = row => ({ id: row.id, code: row.code, kind: row.kind, name: row.name, unit: row.unit,
  brand: row.brand, serial: row.serial, notes: row.notes, status: row.status, warehouse: Number(row.warehouse_qty) / 1000,
  minimum: Number(row.minimum_qty) / 1000, employeeId: row.employee_id, orderId: row.order_id,
  employeeName: row.employee_name, client: row.client, dueDate: row.due_date, version: row.version })

export async function migrateInventory(dbRun) {
  await dbRun(`CREATE TABLE IF NOT EXISTS inventory_items (
    id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, unit TEXT NOT NULL,
    brand TEXT NOT NULL DEFAULT '', serial TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'En bodega', warehouse_qty BIGINT NOT NULL DEFAULT 0 CHECK (warehouse_qty >= 0),
    minimum_qty BIGINT NOT NULL DEFAULT 0 CHECK (minimum_qty >= 0), employee_id TEXT REFERENCES employees(id),
    order_id TEXT REFERENCES work_orders(id), due_date TEXT, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
  )`)
  await dbRun(`CREATE TABLE IF NOT EXISTS inventory_allocations (
    id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES inventory_items(id), order_id TEXT NOT NULL REFERENCES work_orders(id),
    employee_id TEXT NOT NULL REFERENCES employees(id), quantity BIGINT NOT NULL CHECK (quantity >= 0),
    UNIQUE(item_id,order_id,employee_id)
  )`)
  await dbRun(`CREATE TABLE IF NOT EXISTS inventory_movements (
    id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, item_id TEXT NOT NULL REFERENCES inventory_items(id),
    action TEXT NOT NULL, quantity BIGINT NOT NULL, employee_id TEXT REFERENCES employees(id),
    order_id TEXT REFERENCES work_orders(id), actor_id TEXT NOT NULL REFERENCES users(id),
    notes TEXT NOT NULL, created_at TEXT NOT NULL
  )`)
  await dbRun('CREATE INDEX IF NOT EXISTS inventory_moves_item_idx ON inventory_movements(item_id,created_at)')
  await dbRun('INSERT INTO schema_migrations (version,applied_at) VALUES ($1,$2) ON CONFLICT (version) DO NOTHING', ['010-inventory', new Date().toISOString()])
}

export function registerInventory(app, { authRequired, allowRoles, asyncRoute, dbGet, dbQuery, withTransaction }) {
  const readers = allowRoles('Gerente', 'Supervisor', 'Secretaria')
  const writers = allowRoles('Gerente', 'Supervisor')
  const route = handler => asyncRoute(async (req, res) => {
    try { return await handler(req, res) }
    catch (error) {
      if (error.status) return res.status(error.status).json({ message: error.message })
      if (error.code === '23505' || String(error.code).startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ message: 'El código ya existe o el movimiento se está procesando. Actualiza los datos.' })
      throw error
    }
  })
  const itemSelect = `SELECT i.*,e.name AS employee_name,o.client FROM inventory_items i
    LEFT JOIN employees e ON e.id=i.employee_id LEFT JOIN work_orders o ON o.id=i.order_id`

  app.get('/api/inventory', authRequired, readers, route(async (_req, res) => {
    const items = await dbQuery(`${itemSelect} ORDER BY i.name,i.code`)
    const allocations = await dbQuery(`SELECT a.id,a.item_id,a.order_id,a.employee_id,a.quantity,e.name AS employee_name,o.client
      FROM inventory_allocations a JOIN employees e ON e.id=a.employee_id JOIN work_orders o ON o.id=a.order_id WHERE a.quantity > 0 ORDER BY o.client,e.name`)
    const employees = await dbQuery("SELECT id,name FROM employees WHERE status='Activo' ORDER BY name")
    const orders = await dbQuery("SELECT id,client FROM work_orders WHERE status <> 'Cerrada' ORDER BY client")
    res.set('Cache-Control', 'private, no-store')
    return res.json({ items: items.map(serialize), allocations: allocations.map(a => ({ id: a.id, itemId: a.item_id, orderId: a.order_id, employeeId: a.employee_id, quantity: Number(a.quantity) / 1000, employeeName: a.employee_name, client: a.client })), employees, orders, generatedAt: new Date().toISOString() })
  }))
  app.get('/api/inventory/:id/history', authRequired, readers, route(async (req, res) => {
    const rows = await dbQuery(`SELECT m.*,e.name AS employee_name,o.client,u.name AS actor_name FROM inventory_movements m
      LEFT JOIN employees e ON e.id=m.employee_id LEFT JOIN work_orders o ON o.id=m.order_id JOIN users u ON u.id=m.actor_id
      WHERE m.item_id=$1 ORDER BY m.created_at DESC,m.id LIMIT 200`, [req.params.id])
    return res.json(rows.map(m => ({ id: m.id, action: m.action, quantity: Number(m.quantity) / 1000, employeeName: m.employee_name, client: m.client, actorName: m.actor_name, notes: m.notes, createdAt: m.created_at })))
  }))
  app.get('/api/inventory/:id/qr.png', authRequired, readers, route(async (req, res) => {
    const item = await dbGet('SELECT code FROM inventory_items WHERE id=$1', [req.params.id])
    if (!item) fail('Elemento no encontrado.', 404)
    const bytes = await QRCode.toBuffer(item.code, { type: 'png', width: 360, margin: 3, errorCorrectionLevel: 'M' })
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' }).send(bytes)
  }))
  app.post('/api/inventory', authRequired, writers, route(async (req, res) => {
    const { kind, name, unit = 'unidad', brand = '', serial = '', notes = '', code: inputCode = '', minimum = 0, initial = 0 } = req.body ?? {}
    if (!['Herramienta', 'Material'].includes(kind) || !text(name, 160, true) || !text(unit, 40, true) || !text(brand, 120) || !text(serial, 120) || !text(notes, 2000) || typeof inputCode !== 'string' || (inputCode && !/^\d{4,20}$/.test(inputCode))) fail('Revisa nombre, tipo, unidad y código numérico de 4 a 20 dígitos.')
    const minimumQty = minimum === 0 ? 0 : units(minimum), initialQty = initial === 0 ? 0 : units(initial)
    if (kind === 'Herramienta' && (minimumQty || initialQty)) fail('Cada herramienta es una pieza individual. No registra cantidades de material.')
    const id = randomUUID(), code = inputCode || String(randomInt(100000000000, 999999999999)), now = new Date().toISOString()
    await withTransaction(async tx => {
      await tx.run(`INSERT INTO inventory_items (id,code,kind,name,unit,brand,serial,notes,warehouse_qty,minimum_qty,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [id, code, kind, name.trim(), kind === 'Herramienta' ? 'unidad' : unit.trim(), brand.trim(), serial.trim(), notes.trim(), initialQty, minimumQty, now])
      await tx.run(`INSERT INTO inventory_movements (id,request_id,item_id,action,quantity,actor_id,notes,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [randomUUID(), randomUUID(), id, 'Registro inicial', kind === 'Herramienta' ? 1000 : initialQty, req.user.id, notes.trim(), now])
    })
    return res.status(201).json(serialize(await dbGet(`${itemSelect} WHERE i.id=$1`, [id])))
  }))
  app.patch('/api/inventory/:id', authRequired, allowRoles('Gerente'), route(async (req, res) => {
    const { name, brand = '', serial = '', notes = '', minimum = 0, version } = req.body ?? {}
    if (!text(name, 160, true) || !text(brand, 120) || !text(serial, 120) || !text(notes, 2000) || !Number.isInteger(version)) fail('Revisa los datos de la ficha.')
    const minimumQty = minimum === 0 ? 0 : units(minimum)
    await withTransaction(async tx => {
      const item = await tx.get('SELECT * FROM inventory_items WHERE id=$1', [req.params.id])
      if (!item) fail('Elemento no encontrado.', 404)
      if (item.kind === 'Herramienta' && minimumQty) fail('Las herramientas individuales no tienen existencia mínima.')
      const changed = await tx.run('UPDATE inventory_items SET name=$1,brand=$2,serial=$3,notes=$4,minimum_qty=$5,version=version+1 WHERE id=$6 AND version=$7', [name.trim(), brand.trim(), serial.trim(), notes.trim(), minimumQty, item.id, version])
      if ((changed.rowCount ?? changed.changes) !== 1) fail('La ficha cambió. Actualiza antes de guardar.', 409)
      const audit = JSON.stringify({ anterior: { name: item.name, brand: item.brand, serial: item.serial, notes: item.notes, minimum: Number(item.minimum_qty) / 1000 }, nuevo: { name: name.trim(), brand: brand.trim(), serial: serial.trim(), notes: notes.trim(), minimum } })
      await tx.run(`INSERT INTO inventory_movements (id,request_id,item_id,action,quantity,actor_id,notes,created_at) VALUES ($1,$2,$3,'Actualización de ficha',0,$4,$5,$6)`, [randomUUID(), randomUUID(), item.id, req.user.id, audit, new Date().toISOString()])
    })
    return res.json({ message: 'Ficha actualizada. El código y la unidad se conservan para mantener la trazabilidad.' })
  }))
  app.post('/api/inventory/:id/movements', authRequired, writers, route(async (req, res) => {
    const { action, quantity = 1, employeeId = null, orderId = null, notes = '', dueDate = null, version, requestId } = req.body ?? {}
    if (!Number.isInteger(version) || !text(notes, 2000, true) || typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(requestId)) fail('Indica el motivo del movimiento y actualiza el inventario.')
    if (dueDate !== null && (typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate)) || new Date(dueDate).toISOString().slice(0, 10) !== dueDate)) fail('Fecha prevista de devolución no válida.')
    const qty = units(quantity)
    await withTransaction(async tx => {
      const repeated = await tx.get('SELECT item_id,actor_id FROM inventory_movements WHERE request_id=$1', [requestId])
      if (repeated) {
        if (repeated.item_id !== req.params.id || repeated.actor_id !== req.user.id) fail('Identificador de movimiento ya utilizado.', 409)
        return
      }
      const item = await tx.get('SELECT * FROM inventory_items WHERE id=$1', [req.params.id])
      if (!item) fail('Elemento no encontrado.', 404)
      if (item.version !== version) fail('El inventario cambió. Actualiza antes de registrar el movimiento.', 409)
      const now = new Date().toISOString()
      let employee = employeeId, order = orderId, warehouse = Number(item.warehouse_qty), status = item.status, due = item.due_date
      const validDestination = async () => {
        if (typeof employee !== 'string' || !await tx.get("SELECT id FROM employees WHERE id=$1 AND status='Activo'", [employee])) fail('Selecciona un trabajador activo.')
        if (typeof order !== 'string' || !await tx.get("SELECT id FROM work_orders WHERE id=$1 AND status <> 'Cerrada'", [order])) fail('Selecciona una obra abierta.')
      }
      if (item.kind === 'Herramienta') {
        if (qty !== 1000) fail('Una herramienta individual se mueve de una en una.')
        if (action === 'Préstamo') {
          if (status !== 'En bodega') fail('La herramienta no está disponible en bodega.', 409)
          await validDestination(); status = 'Prestada'; due = dueDate
        } else if (['Devolución', 'Devolución con daño'].includes(action)) {
          if (status !== 'Prestada') fail('La herramienta no tiene un préstamo abierto.', 409)
          employee = item.employee_id; order = item.order_id; status = action === 'Devolución' ? 'En bodega' : 'Mantenimiento'; due = null
        } else if (action === 'Mantenimiento') {
          if (status !== 'En bodega') fail('Primero devuelve la herramienta a bodega.', 409)
          employee = null; order = null; status = 'Mantenimiento'
        } else if (action === 'Disponible') {
          if (status !== 'Mantenimiento') fail('La herramienta no está en mantenimiento.', 409)
          employee = null; order = null; status = 'En bodega'
        } else if (action === 'Baja') {
          if (req.user.role !== 'Gerente') fail('Solo el Gerente puede dar de baja herramientas.', 403)
          if (!['En bodega', 'Mantenimiento'].includes(status)) fail('Primero devuelve la herramienta.', 409)
          employee = null; order = null; status = 'Baja'; due = null
        } else fail('Movimiento de herramienta no válido.')
      } else {
        if (['Entrada', 'Ajuste positivo', 'Ajuste negativo'].includes(action)) {
          if (action !== 'Entrada' && req.user.role !== 'Gerente') fail('Solo el Gerente realiza ajustes de inventario.', 403)
          warehouse += action === 'Ajuste negativo' ? -qty : qty; employee = null; order = null
        } else if (action === 'Entrega a obra') {
          await validDestination(); warehouse -= qty
          await tx.run(`INSERT INTO inventory_allocations (id,item_id,order_id,employee_id,quantity) VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT (item_id,order_id,employee_id) DO UPDATE SET quantity=inventory_allocations.quantity+excluded.quantity`, [randomUUID(), item.id, order, employee, qty])
        } else if (['Consumo', 'Retorno a bodega'].includes(action)) {
          const allocation = await tx.get('SELECT id,quantity FROM inventory_allocations WHERE item_id=$1 AND order_id=$2 AND employee_id=$3', [item.id, order, employee])
          if (!allocation || Number(allocation.quantity) < qty) fail('La obra y el responsable no tienen esa cantidad pendiente.', 409)
          const changed = await tx.run('UPDATE inventory_allocations SET quantity=quantity-$1 WHERE id=$2 AND quantity >= $1', [qty, allocation.id])
          if ((changed.rowCount ?? changed.changes) !== 1) fail('El material disponible cambió. Actualiza.', 409)
          if (action === 'Retorno a bodega') warehouse += qty
        } else fail('Movimiento de material no válido.')
        if (warehouse < 0) fail('No hay suficiente material en bodega.', 409)
        if (warehouse > 1000000000000) fail('La cantidad supera el máximo admitido.')
      }
      const outstandingTool = item.kind === 'Herramienta' && status === 'Prestada'
      const updated = await tx.run(`UPDATE inventory_items SET warehouse_qty=$1,status=$2,employee_id=$3,order_id=$4,due_date=$5,version=version+1
        WHERE id=$6 AND version=$7`, [warehouse, status, outstandingTool ? employee : null, outstandingTool ? order : null, due, item.id, version])
      if ((updated.rowCount ?? updated.changes) !== 1) fail('Otro usuario modificó el inventario. Actualiza.', 409)
      await tx.run(`INSERT INTO inventory_movements (id,request_id,item_id,action,quantity,employee_id,order_id,actor_id,notes,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [randomUUID(), requestId, item.id, action, qty, employee, order, req.user.id, notes.trim(), now])
    })
    return res.json({ message: 'Movimiento registrado y existencias actualizadas.' })
  }))
}
