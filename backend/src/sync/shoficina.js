// backend/src/sync/shoficina.js
const { execFileSync } = require('child_process');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const MDB_PATH      = process.env.SHOFICINA_PATH     || 'C:\\SHARMAQ\\SHOficina\\dados.mdb';
const MDB_PASS      = process.env.SHOFICINA_PASS     || '!(&&!!)&';
const POLL_INTERVAL = parseInt(process.env.SHOFICINA_INTERVAL || '30000'); // 30s padrão

const STATUS_ORDER = { RECEIVED: 0, WAITING: 1, IN_PROGRESS: 2, COMPLETED: 3 };


// Remove acentos para comparação normalizada
function deburr(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Mapa por código numérico (prefixo do status, ex: "6-Autorizado..." → código "6")
const STATUS_CODE_MAP = {
  '1':  'RECEIVED',     // Aguardando avaliação
  '3':  'WAITING',      // Aguardando autorização
  '6':  'IN_PROGRESS',  // Autorizado, Reparo em andamento
  '7':  'WAITING',      // Autorizado, Aguardando peça
  '8':  'IN_PROGRESS',  // Pronto, avisar cliente
  '9':  'IN_PROGRESS',  // Pronto, cliente avisado
  '10': 'COMPLETED',    // Status genérico de finalizado (comum no banco)
  '11': 'COMPLETED',    // Equipamento devolvido sem reparo
  '12': 'COMPLETED',    // Equip entregue aguardando pagamento
  '13': 'COMPLETED',    // EQUIPAMENTO DEVOLVIDO SEM CONSERTO
  '15': 'COMPLETED',    // APARELHOS SEM CONSERTO
  '18': 'IN_PROGRESS',  // Serviço (texto truncado — tratar como aberta)
  '22': 'WAITING',      // Em Negociação
  '25': 'WAITING',      // Aguardando (texto truncado)
  '26': 'COMPLETED',    // Pagamento Boleto - Aparelho Entregue
  '27': 'IN_PROGRESS',  // Garantia
};

// Mapa por texto normalizado (sem código numérico)
const STATUS_TEXT_MAP = {
  'aguardando avaliacao do tecnico': 'RECEIVED',
  'aguardando avaliacao':            'RECEIVED',
  'aguardando autorizacao':          'WAITING',
  'autorizado, reparo em andamento': 'IN_PROGRESS',
  'autorizado, aguardando peca':     'WAITING',
  'pronto, avisar cliente':          'IN_PROGRESS',
  'pronto, cliente avisado':         'IN_PROGRESS',
  'em negociacao':                   'WAITING',
  'garantia':                        'IN_PROGRESS',
  'aluguel':                         'IN_PROGRESS',
  'equipamento devolvido sem reparo':    'COMPLETED',
  'equipamento devolvido sem conserto':  'COMPLETED',
  'aparelhos sem conserto':              'COMPLETED',
  'aparelhos sem conserto ou esquecido': 'COMPLETED',
  'sem conserto':                        'COMPLETED',
  'equipamento entregue reparado':       'COMPLETED',
  'equip entregue aguardando pagamento': 'COMPLETED',
  'pagamento boleto -aparelho entregue': 'COMPLETED',
  'equipamento condenado':               'COMPLETED',
};

function mapStatus(situacao, pronto) {
  // PRONTO/REALIZADO com valor não-falso = concluída (tem precedência)
  const prontoVal = String(pronto || '').trim();
  const prontoFalsy = ['', 'null', '0', 'n', 'false', 'no', 'nao', 'não'];
  if (prontoVal && !prontoFalsy.includes(prontoVal.toLowerCase())) {
    return 'COMPLETED';
  }

  if (!situacao) return 'RECEIVED';

  const raw = String(situacao).trim();
  const norm = deburr(raw);

  // Passo 1: extrai código numérico do prefixo ("6-Autorizado..." → "6")
  const codeMatch = norm.match(/^(\d+)\s*[-:]\s*/);
  if (codeMatch && STATUS_CODE_MAP[codeMatch[1]]) {
    return STATUS_CODE_MAP[codeMatch[1]];
  }

  // Passo 2: texto sem o prefixo numérico
  const descSemCodigo = codeMatch ? norm.slice(codeMatch[0].length).trim() : norm;

  // Passo 3: mapa por texto exato normalizado
  if (STATUS_TEXT_MAP[norm])           return STATUS_TEXT_MAP[norm];
  if (STATUS_TEXT_MAP[descSemCodigo])  return STATUS_TEXT_MAP[descSemCodigo];

  // Passo 4: fallback por palavras-chave
  if (descSemCodigo.includes('devolvido') || descSemCodigo.includes('sem conserto') ||
      descSemCodigo.includes('entregue reparado') || descSemCodigo.includes('aparelho entregue') ||
      descSemCodigo.includes('condenado') || descSemCodigo.includes('esquecido')) {
    return 'COMPLETED';
  }
  if (descSemCodigo.includes('andamento') || descSemCodigo.includes('reparo') ||
      descSemCodigo.includes('pronto') || descSemCodigo.includes('avisado') ||
      descSemCodigo.includes('garantia') || descSemCodigo.includes('aluguel')) {
    return 'IN_PROGRESS';
  }
  if (descSemCodigo.includes('aguard') || descSemCodigo.includes('espera') ||
      descSemCodigo.includes('autorizacao') || descSemCodigo.includes('negociacao') ||
      descSemCodigo.includes('peca')) {
    return 'WAITING';
  }

  // Desconhecido — mantém como RECEIVED (aparece no dashboard para não sumir)
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
  fs.writeFileSync(tmpFile, '\uFEFF' + scriptContent, { encoding: 'utf8' });

  // Tenta 64-bit primeiro, depois 32-bit (drivers Jet/ACE são frequentemente 32-bit)
  const psExes = [
    'powershell.exe',
    'C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe',
  ];

  let lastErr = null;
  for (const psExe of psExes) {
    try {
      const result = execFileSync(psExe, [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmpFile,
      ], { timeout: 60000, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }); // 50MB
      try { fs.unlinkSync(tmpFile); } catch {}
      return result.trim();
    } catch (err) {
      lastErr = err;
      // Se foi timeout ou arquivo não encontrado, não tenta 32-bit
      if (err.code === 'ETIMEDOUT' || err.code === 'ENOENT') break;
      // Erro de provider/driver — tenta 32-bit
      const stderr = err.stderr || '';
      if (!stderr.includes('Provider') && !stderr.includes('ACE') && !stderr.includes('Jet') && !stderr.includes('OLEDB')) break;
    }
  }

  try { fs.unlinkSync(tmpFile); } catch {}

  // Monta mensagem de erro — usa só stderr, nunca stdout (pode ser JSON enorme)
  const stderr  = lastErr?.stderr || '';
  const errLine = stderr.split('\n').find(l => l.trim() && !l.startsWith('+') && !l.startsWith(' ')) || stderr.split('\n')[0] || '';
  const errMsg  = errLine.trim() || lastErr?.message?.split('\n')[0] || 'Erro desconhecido ao executar PowerShell';
  throw new Error(errMsg);
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
    const msg = (err.message || '').split('\n')[0];
    if (msg.includes('JSON') || msg.includes('Unexpected') || msg.includes('maxBuffer')) {
      console.error('❌ [MDB] JSON muito grande — reduza TOP ou aumente buffer:', msg.slice(0,100));
    } else {
      console.error('❌ [MDB] Erro:', msg.slice(0, 200));
    }
    return null;
  }
}

function queryClientName(codCliente) {
  if (!codCliente || codCliente === '0' || codCliente === 'null') return null;
  // Tenta colunas comuns de nome em tabelas de clientes
  const cod = parseInt(codCliente);
  const isNum = !isNaN(cod);
  // CLIENTES.CODIGO é numérico no Access — sem aspas. Se não for número, tenta com aspas.
  const attempts = isNum ? [
    `SELECT NOME FROM [CLIENTES] WHERE CODIGO = ${cod}`,
    `SELECT RAZAO FROM [CLIENTES] WHERE CODIGO = ${cod}`,
  ] : [
    `SELECT NOME FROM [CLIENTES] WHERE CODIGO = '${codCliente}'`,
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

  // Tabelas que definitivamente não são OS (financeiro, config, aux)
  const blacklist = new Set([
    'BANCOS', 'FORNECEDORES', 'FUNCIONARIOS', 'USUARIOS', 'ADVOGADOS',
    'CHEQUES', 'BOLETOS', 'CARTOES', 'CONTAS', 'CONTAS_CONTAS', 'CONTAS_DEPOSITOS',
    'DESPESAS', 'DESP_FIXAS', 'CONFIG', 'PARAMETROS', 'IBPT', 'ICMS_EMP', 'ICMS_UF',
    'EMPRESAS', 'SITUACOES', 'SERVICOS', 'ITENS', 'VENDAS', 'ORCAS', 'LOGUSER',
    'PEDIDOS', 'PLANOS', 'CONTRATOS', 'EQUIP_CONTRATO', 'CLIENTES_ENDERECO',
    'ANIMAIS', 'ATENDIMENTOS', 'APENSOS', 'ANDAMENTO', 'AGENDA', 'ECF_CFG',
    'CALIBRACAO', 'CALIBRACAO_ENSAIOS', 'CALIBRACAO_PADRAO', 'CALIBRACAO_PADRAO_ENSAIOS',
    'CONVENIO_BOLETO', 'CONVENIO_CARTAO',
  ]);

  // Nomes mais comuns de tabela de OS em sistemas brasileiros — do mais ao menos específico
  const priority = [
    // SHOficina clássico
    'ORDEMS', 'OS', 'ORDENS', 'ORDEM',
    // Variações comuns
    'OrdemServico', 'OrdensServico', 'ORDEM_SERVICO', 'ORDENS_SERVICO',
    'ordem_servico', 'Ordens_Servico', 'tblOS', 'tblOrdens', 'OSTable',
    // Este MDB específico parece usar CHAMADO como OS
    'CHAMADO', 'CHAMADOS', 'SOLICITACAO', 'SOLICITACOES',
    'MANUTENCAO', 'MANUTENCOES', 'SERVICO', 'ATENDIMENTO',
  ];

  // Heurística ampliada para identificar tabela de OS
  function looksLikeOSTable(cols) {
    const names = cols.map(c => c.toLowerCase());
    // Precisa ter pelo menos uma coluna de identificação de OS/cliente
    const hasClientRef  = names.some(n => n.includes('cliente') || n.includes('cod_cli') || n === 'cliente');
    const hasStatusRef  = names.some(n => n.includes('situac') || n.includes('status') || n.includes('pronto') || n.includes('realizado') || n.includes('conclu'));
    const hasDateRef    = names.some(n => n.includes('entrada') || n.includes('data') || n.includes('dia') || n.includes('cadastro'));
    const hasEquipRef   = names.some(n => n.includes('aparelho') || n.includes('equipamento') || n.includes('equip') || n.includes('descr') || n.includes('serv'));
    const hasIdRef      = names.some(n => n === 'codigo' || n === 'os' || n.includes('numero') || n.includes('os_num'));

    // Score: quanto mais critérios bater, mais provável ser OS
    const score = [hasClientRef, hasStatusRef, hasDateRef, hasEquipRef, hasIdRef]
      .filter(Boolean).length;

    return score >= 3; // precisa de pelo menos 3 de 5 critérios
  }

  const skipAlreadyTried = new Set();

  // Tenta primeiro as tabelas da lista priority que existem no banco
  const priorityExisting = priority.filter(t =>
    allTables.some(at => at.toUpperCase() === t.toUpperCase())
  );

  // Depois as demais não blacklistadas
  const rest = allTables.filter(t =>
    !blacklist.has(t) && !blacklist.has(t.toUpperCase()) &&
    !priority.some(p => p.toUpperCase() === t.toUpperCase())
  );

  const candidates = [
    ...priorityExisting,
    ...rest,
  ];


  for (const table of candidates) {
    if (skipAlreadyTried.has(table)) continue;
    skipAlreadyTried.add(table);

    const rows = queryMDB(`SELECT TOP 1 * FROM [${table}]`);
    if (!rows || rows.length === 0) continue;

    const cols = Object.keys(rows[0]);
    if (!looksLikeOSTable(cols)) {
      console.log(`⏭️  [SHOficina] Pulando "${table}" — score insuficiente (cols: ${cols.slice(0,6).join(', ')}...)`);
      continue;
    }

    console.log('📋 [SHOficina] Colunas:', cols.join(', '));
    return { table, columns: cols };
  }

  console.error('❌ [SHOficina] Nenhuma tabela de OS encontrada.');
  console.error('   Tabelas disponíveis:', allTables.join(', '));
  return null;
}

function inferColumns(columns) {
  // find: procura correspondência exata primeiro, depois parcial
  const find = (...terms) =>
    columns.find(c => terms.some(t => c.toLowerCase() === t.toLowerCase())) ||
    columns.find(c => terms.some(t => c.toLowerCase().includes(t.toLowerCase()))) ||
    null;

  const map = {
    // ID / número da OS
    id:           find('CODIGO', 'OS_NUMERO', 'NUMERO', 'ID', 'COD_OS'),
    osNumber:     find('CODIGO', 'OS_NUMERO', 'NUMERO', 'ID', 'COD_OS'),
    // Cliente
    client:       find('COD_CLIENTE', 'CLIENTE', 'ID_CLIENTE'),
    // Equipamento — CHAMADO usa DESCRICAO/TIPO como descrição do serviço
    equipment:    find('APARELHO', 'EQUIPAMENTO', 'EQUIP', 'DESCRICAO', 'TIPO', 'SERVICO'),
    brand:        find('MARCA'),
    model:        find('MODELO'),
    serial:       find('SERIE', 'SERIAL', 'NUM_SERIE'),
    patrimony:    find('PATRIMONIO', 'PATRIM'),
    accessories:  find('ACESSORIO', 'ACESS'),
    defect:       find('DEFEITO', 'PROBLEMA', 'DESCRICAO_DEFEITO'),
    observations: find('OBS_SERVICO', 'OBSERVACAO', 'OBS', 'OBSERV'),
    // Status — CHAMADO usa REALIZADO como concluído
    status:       find('SITUACAO', 'STATUS', 'ESTADO'),
    pronto:       find('PRONTO', 'REALIZADO', 'CONCLUIDO', 'FINALIZADO'),
    priority:     find('PRIORIDADE', 'PRIOR', 'URGENCIA'),
    // Datas
    createdAt:    find('ENTRADA', 'DIA_CHAMADO', 'DATA_CADASTRO', 'DATA', 'DIA', 'CADASTRO'),
    completedAt:  find('SAIDA', 'DATA_CONCLUSAO', 'DIA_CONCLUSAO'),
  };

  console.log('🗺️  [SHOficina] Mapeamento de colunas:', JSON.stringify(map));
  return map;
}

class SHOficinaSync {
  constructor(db, io) {
    this.db        = db;
    this.io        = io;
    this.timer     = null;
    this.tableInfo = null;
    this.colMap    = null;
    this.isWindows = process.platform === 'win32';
    // Carrega data de corte do banco (salva em settings)
    this._loadCutoff();
  }

  _loadCutoff() {
    try {
      const row = this.db.prepare("SELECT value FROM settings WHERE key = 'import_cutoff'").get();
      this.importCutoff = row?.value ? new Date(row.value) : new Date('2026-03-18T00:00:00');
    } catch {
      this.importCutoff = new Date('2026-03-18T00:00:00');
    }
    console.log(`📅 [SHOficina] Data de corte: ${this.importCutoff.toLocaleDateString('pt-BR')}`);
  }

  setCutoff(isoDate) {
    this.importCutoff = new Date(isoDate);
    try {
      this.db.prepare("INSERT INTO settings (key, value) VALUES ('import_cutoff', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run(isoDate);
    } catch {}
    console.log(`📅 [SHOficina] Nova data de corte: ${this.importCutoff.toLocaleDateString('pt-BR')}`);
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
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  async _setup() {
    this.tableInfo = discoverColumns();
    if (!this.tableInfo) {
      console.error('❌ [SHOficina] Tentando novamente em 30s...');
      setTimeout(() => this._setup(), 30000);
      return;
    }
    this.colMap = inferColumns(this.tableInfo.columns);
    console.log('🗺️  [SHOficina] Mapeamento:', JSON.stringify(this.colMap));
    this._clientCache = {};
    this._clientCacheTime = 0;

    // Remove do banco local OS importadas antes do corte (limpeza única)
    try {
      const cutoffStr = this.importCutoff.toISOString().slice(0, 10);
      const deleted = this.db.prepare(
        `DELETE FROM orders WHERE optionalDescription LIKE '%[shoficina:%]%' AND createdAt < ?`
      ).run(cutoffStr);
      if (deleted.changes > 0)
        console.log(`🧹 [SHOficina] ${deleted.changes} OS antigas removidas (antes de ${cutoffStr})`);
    } catch (e) {
      console.error('❌ [SHOficina] Erro na limpeza:', e.message);
    }

    // Usa setTimeout recursivo em vez de setInterval
    // Garante que o próximo poll só começa APÓS o anterior terminar
    const schedulePoll = () => {
      this.timer = setTimeout(async () => {
        await this._poll();
        if (this.timer !== null) schedulePoll();
      }, POLL_INTERVAL);
    };
    await this._poll();
    schedulePoll();
  }

  async _poll() {
    const { table } = this.tableInfo;
    const col = this.colMap;

    // Sem JOIN — COD_CLIENTE(texto) vs CLIENTES.CODIGO(número) causa erro de tipo no OleDB
    // O nome do cliente é resolvido em _syncRow via queryClientName()
    // Sem ORDER BY — CODIGO é texto no Access, ordenar causa erro de tipo
    const sql = `SELECT TOP 500 * FROM [${table}] ORDER BY CODIGO DESC`; // Suficiente com cutoff de data

    const rows = queryMDB(sql);
    if (rows === null) {
      console.error(`❌ [POLL] Falha ao ler tabela "${table}" (ver erro acima)`);
      return;
    }




    console.log(`📦 [POLL] ${rows.length} registros lidos`);

    // Cache de clientes por 5 minutos — evita ~16 PowerShells a cada poll
    const cacheAge = Date.now() - (this._clientCacheTime || 0);
    if (cacheAge > 10 * 60 * 1000) { // cache de 10 min
      this._clientCache = this._fetchClientNames(rows, col);
      this._clientCacheTime = Date.now();
      console.log(`👥 [POLL] Cache clientes: ${Object.keys(this._clientCache).length}`);
    }

    let imported = 0, updated = 0;
    for (const row of rows) {
      const r = this._syncRow(row, this._clientCache);
      if (r === 'created') imported++;
      else if (r === 'updated') updated++;
    }
    if (imported > 0) console.log(`✅ [POLL] ${imported} OS importadas`);
    if (updated > 0)  console.log(`🔄 [POLL] ${updated} OS atualizadas`);
    // Verifica OS fechadas só a cada 5 polls — operação mais pesada
    this._pollCount = (this._pollCount || 0) + 1;
    if (this._pollCount % 5 === 0) this._checkClosedInDB(rows);
  }


  _syncRow(row, clientMap = {}) {
    try {
    const col = this.colMap;

    const extId      = col.id ? String(row[col.id] || '').trim() : null;
    const osNumber   = extId;

    if (!osNumber) return;

    const codCliente = col.client ? String(row[col.client] || '').trim() : null;
    // Usa o mapa pré-carregado em batch (sem PowerShell adicional por OS)
    const clientName = (codCliente && clientMap[codCliente])
      ? clientMap[codCliente]
      : (codCliente || 'Cliente SHOficina');

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

    // Só importa OS criadas a partir do corte — se não tiver data ou for anterior, ignora
    if (!shoCreatedAt) return;
    const osDate = new Date(shoCreatedAt);
    if (isNaN(osDate.getTime()) || osDate < this.importCutoff) return;

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
      if (order) this.io.emit('os:created', { order });
      return 'created';

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

      const createdAtChanged = shoCreatedAt && existing.createdAt !== shoCreatedAt;

      // Só escreve se algo mudou de verdade — evita writes e socket emits desnecessários
      if (!statusChanged && !clientChanged && !equipChanged && !createdAtChanged) return;

      // Preserva completedAt existente se já estava concluída
      const completedAt = newStatus === 'COMPLETED' ? (existing.completedAt || now) : null;
      // Sempre atualiza createdAt com o valor real do SHOficina (campo ENTRADA)
      this.db.prepare(
        `UPDATE orders SET currentStatus = ?, completedAt = ?, clientName = ?, equipmentName = ?, createdAt = ?, updatedAt = ? WHERE id = ?`
      ).run(newStatus, completedAt, clientName || existing.clientName, equipment || existing.equipmentName, shoCreatedAt || existing.createdAt, now, existing.id);

      const order = this._getOrder(existing.id);
      if (statusChanged) console.log(`🔄 [SHOficina] OS #${osNumber} → ${newStatus}`);
      if (order) this.io.emit('os:updated', { order });
      return 'updated';
    }
    return null;
    } catch (err) {
      console.error(`❌ [SYNC] Erro na OS #${row[this.colMap?.id] || '?'}: ${err.message}`);
      return null;
    }
  }

  // Marca como COMPLETED no nosso banco as OS que sumiram do resultado do MDB
  // (foram finalizadas no SHOficina e o filtro WHERE já não as retorna mais)
  _fetchClientNames(rows, col) {
    if (!col.client) return {};
    const ids = [...new Set(
      rows.map(r => String(r[col.client] || '').trim())
          .filter(id => id && id !== '0' && !isNaN(parseInt(id)))
    )];
    if (ids.length === 0) return {};
    const map = {};
    const batchSize = 50;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize).map(id => parseInt(id)).join(',');
      const result = queryMDB(`SELECT CODIGO, NOME FROM [CLIENTES] WHERE CODIGO IN (${batch})`);
      if (result) result.forEach(r => {
        if (r.CODIGO && r.NOME) map[String(r.CODIGO).trim()] = String(r.NOME).trim();
      });
    }
    console.log(`👥 [POLL] Clientes: ${Object.keys(map).length}`);
    return map;
  }

  _checkClosedInDB(mdbRows) {
    if (!mdbRows || mdbRows.length === 0) return;

    const col = this.colMap;
    if (!col.id) return;

    // IDs que vieram do MDB neste poll
    const mdbIds = new Set(mdbRows.map(r => String(r[col.id] || '').trim()).filter(Boolean));

    // OS abertas no nosso banco (não COMPLETED)
    const openInDB = this.db.prepare(
      `SELECT id, osNumber, optionalDescription FROM orders WHERE currentStatus != 'COMPLETED'`
    ).all();

    const now = new Date().toISOString();
    for (const order of openInDB) {
      // Extrai o ID do SHOficina do campo optionalDescription ([shoficina:X])
      const match = order.optionalDescription?.match(/\[shoficina:(\d+)\]/);
      const shoId = match ? match[1] : order.osNumber;

      if (shoId && !mdbIds.has(shoId)) {
        // Não veio no resultado = foi finalizada no SHOficina
        this.db.prepare(
          `UPDATE orders SET currentStatus = 'COMPLETED', completedAt = ?, updatedAt = ? WHERE id = ?`
        ).run(now, now, order.id);
        const updated = this._getOrder(order.id);
        this.io.emit('os:updated', { order: updated });
      }
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
  // Testa conexão com o MDB usando a infraestrutura existente
  test(mdbPath, mdbPass) {
    const fs = require('fs');
    if (!mdbPath) return { success: false, error: 'Caminho do arquivo MDB não informado.' };
    if (!fs.existsSync(mdbPath)) return { success: false, error: `Arquivo não encontrado: ${mdbPath}` };

    // Constrói script de teste com path/pass diretos (sem depender de env vars do módulo)
    const testPass = mdbPass !== undefined ? mdbPass : process.env.SHOFICINA_PASS || '';
    const body = `
$cmd = $conn.CreateCommand()
$cmd.CommandText = 'SELECT TOP 1 CODIGO FROM [CLIENTES]'
$reader = $cmd.ExecuteReader()
$reader.Close()
Write-Output 'OK'
`;
    const script = `
$ErrorActionPreference = 'Stop'
$pass = @'
${testPass}
'@
$pass = $pass.Trim()
$src = @'
${mdbPath}
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

    try {
      runPS1(script);
      return { success: true, message: 'Conexão com o banco MDB realizada com sucesso!' };
    } catch (err) {
      // err.message já contém o erro real do PowerShell (vem do runPS1 melhorado)
      const msg = err.message || 'Erro desconhecido ao conectar ao banco MDB';
      return { success: false, error: msg };
    }
  }
}

module.exports = { SHOficinaSync };