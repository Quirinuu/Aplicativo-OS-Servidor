// backend/src/sync/shoficina.js
const { execFileSync } = require('child_process');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const MDB_PATH      = process.env.SHOFICINA_PATH     || 'C:\\SHARMAQ\\SHOficina\\dados.mdb';
const MDB_PASS      = process.env.SHOFICINA_PASS     || '!(&&!!)&';
const POLL_INTERVAL = parseInt(process.env.SHOFICINA_INTERVAL || '5000');

const STATUS_ORDER = { RECEIVED: 0, WAITING: 1, IN_PROGRESS: 2, COMPLETED: 3 };

function mapStatus(situacao, pronto) {
  // PRONTO pode ser: "S", "s", "1", ou uma data/hora ("03/03/2026 19:25:41")
  // Qualquer valor não-vazio e não-nulo significa que a OS foi concluída
  const prontoVal = String(pronto || '').trim();
  if (prontoVal && prontoVal.toLowerCase() !== 'null' && prontoVal !== '0' && prontoVal !== 'n') {
    return 'COMPLETED';
  }

  if (!situacao) return 'RECEIVED';
  const v = String(situacao).toLowerCase().trim();

  // Códigos numéricos do SHOficina (baseado nos dados observados)
  // 10 = Concluída/Entregue, 3 = Em aberto/Recebida
  if (v === '10' || v === '9' || v === '8') return 'COMPLETED';
  if (v === '5' || v === '6' || v === '7')  return 'IN_PROGRESS';
  if (v === '4')                             return 'WAITING';
  // Códigos texto (fallback para outros sistemas)
  if (v.includes('conclu') || v.includes('pronto') || v.includes('entreg')) return 'COMPLETED';
  if (v.includes('andamento') || v.includes('execu') || v.includes('reparo'))  return 'IN_PROGRESS';
  if (v.includes('aguard') || v.includes('espera'))                             return 'WAITING';
  return 'RECEIVED';
}

function mapPriority(p) {
  if (!p) return 'MEDIUM';
  const v = String(p).toLowerCase();
  if (v === 's' || v === '1' || v.includes('urg')) return 'URGENT';
  if (v.includes('alta') || v === '2')              return 'HIGH';
  if (v.includes('baixa') || v === '4')             return 'LOW';
  return 'MEDIUM';
}

function runPS1(scriptContent) {
  const tmpFile = path.join(os.tmpdir(), `sho_${Date.now()}.ps1`);
  try {
    fs.writeFileSync(tmpFile, '\uFEFF' + scriptContent, { encoding: 'utf8' });
    const result = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmpFile,
    ], { timeout: 15000, encoding: 'utf8' });
    return result.trim();
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

function buildConnScript(body) {
  return `
$ErrorActionPreference = 'Stop'
$pass = @'
${MDB_PASS}
'@
$pass = $pass.Trim()
$src = @'
${MDB_PATH}
'@
$src = $src.Trim()
$conn = New-Object System.Data.OleDb.OleDbConnection
$conn.ConnectionString = "Provider=Microsoft.Jet.OLEDB.4.0;Data Source='$src';Jet OLEDB:Database Password='$pass';"
try { $conn.Open() } catch {
  $conn.ConnectionString = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source='$src';Jet OLEDB:Database Password='$pass';"
  $conn.Open()
}
${body}
$conn.Close()
`.trim();
}

function queryMDB(sql) {
  const body = `
$cmd = $conn.CreateCommand()
$cmd.CommandText = @'
${sql}
'@
$reader = $cmd.ExecuteReader()
$rows = [System.Collections.Generic.List[object]]::new()
while ($reader.Read()) {
  $row = @{}
  for ($i = 0; $i -lt $reader.FieldCount; $i++) {
    $row[$reader.GetName($i)] = if ($reader.IsDBNull($i)) { $null } else { $reader.GetValue($i).ToString() }
  }
  $rows.Add([PSCustomObject]$row)
}
$reader.Close()
if ($rows.Count -eq 0) { Write-Output '[]' } else { $rows | ConvertTo-Json -Depth 2 -Compress }
`;
  try {
    const out = runPS1(buildConnScript(body));
    if (!out || out === '[]' || out === 'null') return [];
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    console.error('❌ [SHOficina] Erro ao consultar MDB:', err.message.split('\n')[0]);
    return null;
  }
}

function queryClientName(codCliente) {
  if (!codCliente || codCliente === '0' || codCliente === 'null') return null;
  // Tenta colunas comuns de nome em tabelas de clientes
  const attempts = [
    `SELECT NOME FROM [CLIENTES] WHERE CODIGO = '${codCliente}'`,
    `SELECT NOME FROM [CLIENTES] WHERE COD_CLIENTE = '${codCliente}'`,
    `SELECT RAZAO FROM [CLIENTES] WHERE CODIGO = '${codCliente}'`,
    `SELECT NOME_CLIENTE FROM [CLIENTES] WHERE CODIGO = '${codCliente}'`,
  ];
  for (const sql of attempts) {
    try {
      const rows = queryMDB(sql);
      if (rows && rows.length > 0) {
        const row = rows[0];
        const val = Object.values(row)[0];
        if (val && val !== '0' && val !== 'null') return String(val).trim();
      }
    } catch {}
  }
  return null;
}

function listTables() {
  const body = `
$schema = $conn.GetOleDbSchemaTable(
  [System.Data.OleDb.OleDbSchemaGuid]::Tables,
  @($null, $null, $null, 'TABLE')
)
$names = @()
foreach ($row in $schema.Rows) { $names += $row['TABLE_NAME'] }
$names | ConvertTo-Json -Compress
`;
  try {
    const out = runPS1(buildConnScript(body));
    if (!out) return [];
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch { return []; }
}

function discoverColumns() {
  console.log('🔍 [SHOficina] Listando tabelas do banco...');
  const allTables = listTables();
  if (allTables.length > 0) {
    console.log('📋 [SHOficina] Tabelas encontradas:', allTables.join(', '));
  }

  const blacklist = new Set([
    'BANCOS', 'CLIENTES', 'FORNECEDORES', 'FUNCIONARIOS', 'USUARIOS',
    'CHEQUES', 'BOLETOS', 'CARTOES', 'CONTAS', 'DESPESAS', 'DESP_FIXAS',
    'AGENDA', 'CONFIG', 'PARAMETROS', 'IBPT', 'ICMS_EMP', 'ICMS_UF',
    'EMPRESAS', 'SITUACOES', 'SERVICOS', 'ITENS', 'VENDAS', 'ORCAS',
    'PEDIDOS', 'PLANOS', 'CONTRATOS', 'EQUIPAMENTOS', 'LOGUSER',
  ]);

  const priority = [
    'ORDEMS', 'OS', 'OrdemServico', 'OrdensServico', 'ordem_servico',
    'Ordens_Servico', 'tblOS', 'tblOrdens', 'OSTable',
  ];

  const candidates = [
    ...priority,
    ...allTables.filter(t => !blacklist.has(t) && !priority.includes(t)),
  ];

  for (const table of candidates) {
    const rows = queryMDB(`SELECT TOP 1 * FROM [${table}]`);
    if (rows && rows.length > 0) {
      const cols = Object.keys(rows[0]);
      const looksLikeOS = cols.some(c => {
        const l = c.toLowerCase();
        return l.includes('cliente') || l.includes('aparelho') || l.includes('equipamento') ||
               l.includes('status') || l.includes('situac') || l.includes('defeito');
      });
      if (!looksLikeOS) {
        console.log(`⏭️  [SHOficina] Pulando "${table}" — não parece tabela de OS`);
        continue;
      }
      console.log(`✅ [SHOficina] Tabela de OS: "${table}"`);
      console.log('📋 [SHOficina] Colunas:', cols.join(', '));
      return { table, columns: cols };
    }
  }

  console.error('❌ [SHOficina] Nenhuma tabela de OS encontrada.');
  return null;
}

function inferColumns(columns) {
  const find = (...terms) =>
    columns.find(c => terms.some(t => c.toLowerCase() === t.toLowerCase())) ||
    columns.find(c => terms.some(t => c.toLowerCase().includes(t.toLowerCase()))) ||
    null;

  return {
    id:           find('CODIGO'),
    osNumber:     find('CODIGO'),
    client:       find('COD_CLIENTE'),
    equipment:    find('APARELHO'),
    brand:        find('MARCA'),
    model:        find('MODELO'),
    serial:       find('SERIE'),
    patrimony:    find('PATRIMONIO'),
    accessories:  find('ACESSORIO'),
    defect:       find('DEFEITO'),
    observations: find('OBS_SERVICO'),
    status:       find('SITUACAO'),
    priority:     find('PRIOR'),
    createdAt:    find('ENTRADA'),
    completedAt:  find('SAIDA'),
    pronto:       find('PRONTO'),
  };
}

class SHOficinaSync {
  constructor(db, io) {
    this.db        = db;
    this.io        = io;
    this.timer     = null;
    this.tableInfo = null;
    this.colMap    = null;
    this.isWindows = process.platform === 'win32';
  }

  start() {
    if (!this.isWindows) {
      console.log('⚠️  [SHOficina] Sync desativado — roda apenas no Windows.');
      return;
    }
    console.log('🔄 [SHOficina] Iniciando sincronização...');
    console.log(`📁 [SHOficina] Caminho: ${MDB_PATH}`);
    console.log(`⏱️  [SHOficina] Intervalo: ${POLL_INTERVAL / 1000}s`);
    this._setup();
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  _setup() {
    this.tableInfo = discoverColumns();
    if (!this.tableInfo) {
      console.error('❌ [SHOficina] Tentando novamente em 30s...');
      setTimeout(() => this._setup(), 30000);
      return;
    }
    this.colMap = inferColumns(this.tableInfo.columns);
    console.log('🗺️  [SHOficina] Mapeamento:', JSON.stringify(this.colMap));
    this.timer = setInterval(() => this._poll(), POLL_INTERVAL);
    this._poll();
  }

  _poll() {
    const { table } = this.tableInfo;
    const col = this.colMap;

    // Sempre busca TODOS os registros — sem filtro de data.
    const orderBy = col.id ? `ORDER BY O.[${col.id}] DESC` : '';
    const sql = `SELECT O.*, C.NOME AS NOME_CLIENTE
                 FROM [${table}] O
                 LEFT JOIN [CLIENTES] C ON C.CODIGO = O.COD_CLIENTE
                 ${orderBy}`;

    const rows = queryMDB(sql);
    if (rows === null) return;

    for (const row of rows) this._syncRow(row);
  }

  _syncRow(row) {
    const col = this.colMap;

    const extId      = col.id ? String(row[col.id] || '').trim() : null;
    const osNumber   = extId;

    // NOME_CLIENTE pode voltar como "0" ou "null" quando o JOIN falha
    const rawNomeCliente = row['NOME_CLIENTE'];
    const joinNome = (rawNomeCliente && rawNomeCliente !== '0' && rawNomeCliente !== 'null')
      ? String(rawNomeCliente).trim()
      : null;
    // Se JOIN falhou, busca direto na tabela CLIENTES pelo código
    const codCliente = col.client ? String(row[col.client] || '').trim() : null;
    const clientName = joinNome || queryClientName(codCliente) || codCliente || 'Cliente SHOficina';

    const aparelho   = col.equipment   ? String(row[col.equipment]   || '').trim() : '';
    const marca      = col.brand       ? String(row[col.brand]       || '').trim() : '';
    const modelo     = col.model       ? String(row[col.model]       || '').trim() : '';
    const equipment  = [aparelho, marca, modelo].filter(Boolean).join(' — ') || 'Equipamento';

    const serial     = col.serial      ? String(row[col.serial]      || '').trim() : null;
    const patrimony  = col.patrimony   ? String(row[col.patrimony]   || '').trim() : null;
    const acessorios = col.accessories ? String(row[col.accessories] || '').trim() : null;
    const accessories = [acessorios, patrimony ? `Patrimônio: ${patrimony}` : null]
      .filter(Boolean).join(' | ') || null;

    const defect     = col.defect       ? String(row[col.defect]       || '').trim() : null;
    const obs        = col.observations ? String(row[col.observations] || '').trim() : null;

    const status     = mapStatus(col.status ? row[col.status] : null, col.pronto ? row[col.pronto] : null);
    const priority   = mapPriority(col.priority ? row[col.priority] : null);

    // Usa a data ENTRADA do SHOficina como createdAt
    // Armazena como string ISO sem fuso (naive) para preservar o horário exato do SHOficina
    let shoCreatedAt = null;
    const rawEntrada = col.createdAt ? String(row[col.createdAt] || '').trim() : '';
    if (rawEntrada && rawEntrada !== 'null') {
      // Formato BR: DD/MM/YYYY HH:MM:SS  ou  DD/MM/YYYY HH:MM  ou  DD/MM/YYYY
      const brMatch = rawEntrada.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
      if (brMatch) {
        const [, d, m, y, hh = '00', mm = '00', ss = '00'] = brMatch;
        // Sem "Z" no final — preserva horário local sem converter para UTC
        shoCreatedAt = `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
      } else if (rawEntrada) {
        // Fallback para outros formatos
        const parsed = new Date(rawEntrada);
        if (!isNaN(parsed.getTime())) shoCreatedAt = rawEntrada;
      }
    }

    if (!osNumber || !extId) return;

    const existing = this.db.prepare(
      `SELECT id, currentStatus, clientName, equipmentName, createdAt, updatedAt FROM orders WHERE osNumber = ? OR optionalDescription LIKE ?`
    ).get(osNumber, `%[shoficina:${extId}]%`);

    const now = new Date().toISOString();

    if (!existing) {
      const result = this.db.prepare(`
        INSERT INTO orders (
          osNumber, clientName, equipmentName, serialNumber,
          accessories, hasPreviousDefect, previousDefectDescription,
          optionalDescription, priority, currentStatus, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        osNumber,
        clientName  || 'Cliente SHOficina',
        equipment,
        serial      || null,
        accessories || null,
        defect ? 1 : 0,
        defect      || null,
        `[shoficina:${extId}]${obs ? ' ' + obs : ''}`.trim(),
        priority, status, shoCreatedAt || now, now
      );

      const order = this._getOrder(result.lastInsertRowid);
      console.log(`✅ [SHOficina] OS importada: #${osNumber} — ${clientName} — ${equipment}`);
      this.io.emit('os:created', { order });

    } else {

      // Verifica se cliente ou equipamento precisam ser corrigidos (ex: vinham como "0")
      const needsClientFix    = !existing.clientName    || existing.clientName    === '0' || existing.clientName    === 'Cliente SHOficina';
      const needsEquipFix     = !existing.equipmentName || existing.equipmentName === '0' || existing.equipmentName === 'Equipamento';
      const clientChanged     = needsClientFix    && clientName    && clientName    !== '0';
      const equipChanged      = needsEquipFix     && equipment     && equipment     !== '0' && equipment !== 'Equipamento';

      // Calcula novo status (respeitando regras de não regressão)
      let newStatus = existing.currentStatus;
      if (existing.currentStatus !== 'COMPLETED') {
        const currentLevel = STATUS_ORDER[existing.currentStatus] ?? 0;
        const newLevel     = STATUS_ORDER[status] ?? 0;
        if (newLevel >= currentLevel) newStatus = status;
      }

      const statusChanged = newStatus !== existing.currentStatus;

      // Se nada mudou, sai
      if (!statusChanged && !clientChanged && !equipChanged) return;

      const completedAt = newStatus === 'COMPLETED' ? now : null;
      // Sempre atualiza createdAt com o valor real do SHOficina (campo ENTRADA)
      this.db.prepare(
        `UPDATE orders SET currentStatus = ?, completedAt = ?, clientName = ?, equipmentName = ?, createdAt = ?, updatedAt = ? WHERE id = ?`
      ).run(newStatus, completedAt, clientName || existing.clientName, equipment || existing.equipmentName, shoCreatedAt || existing.createdAt, now, existing.id);

      const order = this._getOrder(existing.id);
      if (statusChanged)  console.log(`🔄 [SHOficina] OS #${osNumber} status → ${newStatus}`);
      if (clientChanged)  console.log(`🔄 [SHOficina] OS #${osNumber} cliente corrigido → ${clientName}`);
      if (equipChanged)   console.log(`🔄 [SHOficina] OS #${osNumber} equipamento corrigido → ${equipment}`);
      this.io.emit('os:updated', { order });
    }
  }

  _getOrder(id) {
    const row = this.db.prepare(`
      SELECT o.*,
             u1.fullName AS assignedFullName, u1.id AS assignedId, u1.username AS assignedUsername,
             u2.fullName AS createdFullName,  u2.id AS createdId
      FROM orders o
      LEFT JOIN users u1 ON u1.id = o.assignedToUserId
      LEFT JOIN users u2 ON u2.id = o.createdById
      WHERE o.id = ?
    `).get(id);
    if (!row) return null;
    return {
      id: row.id, osNumber: row.osNumber, clientName: row.clientName,
      equipmentName: row.equipmentName, serialNumber: row.serialNumber,
      priority: row.priority, currentStatus: row.currentStatus,
      optionalDescription: row.optionalDescription,
      accessories: row.accessories,
      hasPreviousDefect: !!row.hasPreviousDefect,
      previousDefectDescription: row.previousDefectDescription,
      createdAt: row.createdAt, updatedAt: row.updatedAt, completedAt: row.completedAt,
      assignedToUser: row.assignedId ? { id: row.assignedId, fullName: row.assignedFullName, username: row.assignedUsername } : null,
      createdByUser:  row.createdId  ? { id: row.createdId,  fullName: row.createdFullName } : null,
      comments: [],
    };
  }
}

module.exports = { SHOficinaSync };