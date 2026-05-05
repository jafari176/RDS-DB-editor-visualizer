'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Column {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

interface TableState {
  columns: Column[];
  primaryKeys: string[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
}

interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  error?: string;
}

type ActiveTab = 'schema' | 'data' | 'query';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const PG_TYPES = [
  'TEXT', 'VARCHAR(255)', 'CHAR(1)', 'INTEGER', 'BIGINT', 'SMALLINT',
  'NUMERIC', 'DECIMAL', 'REAL', 'DOUBLE PRECISION', 'BOOLEAN',
  'TIMESTAMP WITHOUT TIME ZONE', 'TIMESTAMP WITH TIME ZONE',
  'DATE', 'TIME', 'UUID', 'JSON', 'JSONB', 'BYTEA', 'SERIAL', 'BIGSERIAL',
];

const TYPE_COLORS: Record<string, string> = {
  integer: 'bg-blue-900/50 text-blue-300',
  bigint: 'bg-blue-900/50 text-blue-300',
  smallint: 'bg-blue-900/50 text-blue-300',
  serial: 'bg-blue-900/50 text-blue-300',
  bigserial: 'bg-blue-900/50 text-blue-300',
  numeric: 'bg-cyan-900/50 text-cyan-300',
  decimal: 'bg-cyan-900/50 text-cyan-300',
  real: 'bg-cyan-900/50 text-cyan-300',
  'double precision': 'bg-cyan-900/50 text-cyan-300',
  text: 'bg-green-900/50 text-green-300',
  'character varying': 'bg-green-900/50 text-green-300',
  character: 'bg-green-900/50 text-green-300',
  boolean: 'bg-yellow-900/50 text-yellow-300',
  'timestamp without time zone': 'bg-purple-900/50 text-purple-300',
  'timestamp with time zone': 'bg-purple-900/50 text-purple-300',
  date: 'bg-purple-900/50 text-purple-300',
  time: 'bg-purple-900/50 text-purple-300',
  uuid: 'bg-orange-900/50 text-orange-300',
  json: 'bg-pink-900/50 text-pink-300',
  jsonb: 'bg-pink-900/50 text-pink-300',
  bytea: 'bg-red-900/50 text-red-300',
};

// ─── Utils ────────────────────────────────────────────────────────────────────

function typeColor(type: string) {
  return TYPE_COLORS[type.toLowerCase()] ?? 'bg-gray-800 text-gray-400';
}

/** Escape a user-supplied string into a SQL literal. */
function sqlLit(value: string): string {
  if (value === '' || value.toLowerCase() === 'null') return 'NULL';
  if (value.toLowerCase() === 'true') return 'TRUE';
  if (value.toLowerCase() === 'false') return 'FALSE';
  if (/^-?\d+(\.\d+)?$/.test(value)) return value;
  return `'${value.replace(/'/g, "''")}'`;
}

/** Build a WHERE clause from a row using PK columns (or all columns if no PK). */
function buildWhere(row: Record<string, unknown>, pks: string[], allCols: Column[]): string {
  const cols = pks.length > 0 ? pks : allCols.map(c => c.column_name);
  return cols
    .map(col => {
      const v = row[col];
      if (v === null || v === undefined) return `"${col}" IS NULL`;
      return `"${col}" = ${sqlLit(String(v))}`;
    })
    .join(' AND ');
}

async function execute(sql: string): Promise<QueryResult> {
  const res = await fetch('/api/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });
  return res.json();
}

// ─── Base UI ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="text-gray-700 italic text-[10px]">NULL</span>;
  if (typeof value === 'boolean')
    return <span className={value ? 'text-green-400' : 'text-red-400'}>{String(value)}</span>;
  if (typeof value === 'object')
    return <span className="text-pink-400">{JSON.stringify(value)}</span>;
  return <span className="text-gray-300">{String(value)}</span>;
}

function Modal({
  title, onClose, children, width = 'max-w-lg',
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className={`bg-gray-900 border border-gray-700 rounded-lg w-full ${width} shadow-2xl`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-300 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({
  label, children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full bg-gray-800 border border-gray-700 focus:border-blue-500 rounded px-3 py-2 text-xs text-gray-200 outline-none transition-colors placeholder-gray-600';

function ModalFooter({
  onCancel, onConfirm, loading, confirmLabel = 'Save', danger = false,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-800">
      <button
        onClick={onCancel}
        disabled={loading}
        className="px-4 py-2 text-xs text-gray-400 hover:text-gray-200 transition-colors"
      >
        Cancel
      </button>
      <button
        onClick={onConfirm}
        disabled={loading}
        className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded transition-colors disabled:opacity-50 ${
          danger
            ? 'bg-red-700 hover:bg-red-600 text-white'
            : 'bg-blue-600 hover:bg-blue-500 text-white'
        }`}
      >
        {loading && <Spinner />}
        {confirmLabel}
      </button>
    </div>
  );
}

// ─── Confirm Modal ─────────────────────────────────────────────────────────────

function ConfirmModal({
  message, onConfirm, onClose,
}: {
  message: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal title="Confirm" onClose={onClose} width="max-w-sm">
      <p className="text-sm text-gray-300">{message}</p>
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      <ModalFooter
        onCancel={onClose}
        loading={loading}
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          setLoading(true);
          try { await onConfirm(); onClose(); }
          catch (e) { setError(String(e)); }
          finally { setLoading(false); }
        }}
      />
    </Modal>
  );
}

// ─── Add Column Modal ──────────────────────────────────────────────────────────

function AddColumnModal({
  tableName, onClose, onSuccess,
}: {
  tableName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({ name: '', type: 'TEXT', nullable: true, defaultValue: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const col = form.name.trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (!col) { setError('Column name is required'); return; }
    const notNull = form.nullable ? '' : ' NOT NULL';
    const def = form.defaultValue.trim() ? ` DEFAULT ${form.defaultValue.trim()}` : '';
    const sql = `ALTER TABLE "${tableName}" ADD COLUMN "${col}" ${form.type}${notNull}${def}`;
    setLoading(true);
    const res = await execute(sql);
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    onSuccess();
    onClose();
  };

  return (
    <Modal title={`Add Column — ${tableName}`} onClose={onClose}>
      <Field label="Column Name">
        <input className={inputCls} placeholder="column_name" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      </Field>
      <Field label="Data Type">
        <select className={inputCls} value={form.type}
          onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
          {PG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <div className="flex items-center gap-3 mb-4">
        <input type="checkbox" id="nullable" checked={form.nullable}
          onChange={e => setForm(f => ({ ...f, nullable: e.target.checked }))}
          className="accent-blue-500" />
        <label htmlFor="nullable" className="text-xs text-gray-400">Nullable</label>
      </div>
      <Field label="Default Value (optional)">
        <input className={inputCls} placeholder="e.g. NOW(), 0, 'active'" value={form.defaultValue}
          onChange={e => setForm(f => ({ ...f, defaultValue: e.target.value }))} />
      </Field>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      <ModalFooter onCancel={onClose} onConfirm={submit} loading={loading} confirmLabel="Add Column" />
    </Modal>
  );
}

// ─── Edit Column Modal (Rename) ───────────────────────────────────────────────

function EditColumnModal({
  tableName, column, onClose, onSuccess,
}: {
  tableName: string;
  column: Column;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [newName, setNewName] = useState(column.column_name);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const safe = newName.trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (!safe || safe === column.column_name) { onClose(); return; }
    setLoading(true);
    const res = await execute(`ALTER TABLE "${tableName}" RENAME COLUMN "${column.column_name}" TO "${safe}"`);
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    onSuccess();
    onClose();
  };

  return (
    <Modal title={`Rename Column`} onClose={onClose} width="max-w-sm">
      <Field label="New Column Name">
        <input className={inputCls} value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
      </Field>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      <ModalFooter onCancel={onClose} onConfirm={submit} loading={loading} confirmLabel="Rename" />
    </Modal>
  );
}

// ─── Add Row Modal ─────────────────────────────────────────────────────────────

function AddRowModal({
  tableName, columns, onClose, onSuccess,
}: {
  tableName: string;
  columns: Column[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const filled = columns.filter(c => values[c.column_name] !== undefined && values[c.column_name] !== '');
    if (filled.length === 0) { setError('Fill in at least one column'); return; }
    const cols = filled.map(c => `"${c.column_name}"`).join(', ');
    const vals = filled.map(c => sqlLit(values[c.column_name] ?? '')).join(', ');
    const sql = `INSERT INTO "${tableName}" (${cols}) VALUES (${vals})`;
    setLoading(true);
    const res = await execute(sql);
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    onSuccess();
    onClose();
  };

  return (
    <Modal title={`Insert Row — ${tableName}`} onClose={onClose} width="max-w-xl">
      <div className="max-h-96 overflow-y-auto space-y-3 pr-1">
        {columns.map(col => (
          <div key={col.column_name} className="flex items-start gap-3">
            <div className="w-40 flex-shrink-0 pt-2">
              <div className="text-xs text-gray-300 truncate">{col.column_name}</div>
              <div className="text-[10px] text-gray-600">{col.data_type}</div>
            </div>
            <input
              className={inputCls + ' flex-1'}
              placeholder={col.is_nullable === 'YES' ? 'NULL' : 'required'}
              value={values[col.column_name] ?? ''}
              onChange={e => setValues(v => ({ ...v, [col.column_name]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
      <ModalFooter onCancel={onClose} onConfirm={submit} loading={loading} confirmLabel="Insert Row" />
    </Modal>
  );
}

// ─── Edit Row Modal ────────────────────────────────────────────────────────────

function EditRowModal({
  tableName, columns, row, primaryKeys, onClose, onSuccess,
}: {
  tableName: string;
  columns: Column[];
  row: Record<string, unknown>;
  primaryKeys: string[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      columns.map(c => [c.column_name, row[c.column_name] == null ? '' : String(row[c.column_name])])
    )
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const editableCols = columns.filter(c => !primaryKeys.includes(c.column_name));
    if (editableCols.length === 0) { setError('No editable columns (all are primary keys)'); return; }
    const sets = editableCols.map(c => `"${c.column_name}" = ${sqlLit(values[c.column_name] ?? '')}`).join(', ');
    const where = buildWhere(row, primaryKeys, columns);
    const sql = `UPDATE "${tableName}" SET ${sets} WHERE ${where}`;
    setLoading(true);
    const res = await execute(sql);
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    onSuccess();
    onClose();
  };

  return (
    <Modal title={`Edit Row — ${tableName}`} onClose={onClose} width="max-w-xl">
      <div className="max-h-96 overflow-y-auto space-y-3 pr-1">
        {columns.map(col => {
          const isPk = primaryKeys.includes(col.column_name);
          return (
            <div key={col.column_name} className="flex items-start gap-3">
              <div className="w-40 flex-shrink-0 pt-2">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-300 truncate">{col.column_name}</span>
                  {isPk && <span className="text-[9px] bg-yellow-900/50 text-yellow-500 px-1 rounded">PK</span>}
                </div>
                <div className="text-[10px] text-gray-600">{col.data_type}</div>
              </div>
              <input
                className={inputCls + ' flex-1' + (isPk ? ' opacity-50 cursor-not-allowed' : '')}
                readOnly={isPk}
                value={values[col.column_name] ?? ''}
                onChange={e => !isPk && setValues(v => ({ ...v, [col.column_name]: e.target.value }))}
              />
            </div>
          );
        })}
      </div>
      {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
      <ModalFooter onCancel={onClose} onConfirm={submit} loading={loading} confirmLabel="Update Row" />
    </Modal>
  );
}

// ─── Query Results Table ───────────────────────────────────────────────────────

function QueryResultTable({ result }: { result: QueryResult }) {
  if (result.error) {
    return (
      <div className="rounded border border-red-800/50 bg-red-950/30 p-4">
        <p className="text-xs font-medium text-red-400 mb-1">Error</p>
        <p className="text-xs text-red-500/80 font-mono whitespace-pre-wrap">{result.error}</p>
      </div>
    );
  }

  if (result.rows.length === 0) {
    return (
      <div className="rounded border border-gray-800 bg-gray-900/30 p-4 text-xs text-gray-500">
        Query ran successfully — {result.rowCount} row{result.rowCount !== 1 ? 's' : ''} affected
      </div>
    );
  }

  const cols = Object.keys(result.rows[0]);

  return (
    <div className="border border-gray-800 rounded overflow-auto max-h-72">
      <table className="w-full text-xs border-collapse min-w-max">
        <thead className="sticky top-0 bg-gray-900">
          <tr className="border-b border-gray-800">
            {cols.map(c => (
              <th key={c} className="text-left py-2 px-3 text-[10px] text-gray-500 font-medium whitespace-nowrap border-r border-gray-800/50 last:border-r-0">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-800/40 hover:bg-gray-800/20">
              {cols.map(c => (
                <td key={c} className="py-2 px-3 border-r border-gray-800/20 last:border-r-0 max-w-xs">
                  <div className="truncate"><CellValue value={row[c]} /></div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-1.5 border-t border-gray-800 text-[10px] text-gray-600">
        {result.rows.length} row{result.rows.length !== 1 ? 's' : ''} returned
      </div>
    </div>
  );
}

// ─── Query View ────────────────────────────────────────────────────────────────

function QueryView({ initialSql }: { initialSql: string }) {
  const [sql, setSql] = useState(initialSql);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const run = useCallback(async (overrideSql?: string) => {
    const query = (overrideSql ?? sql).trim();
    if (!query) return;
    setRunning(true);
    const res = await execute(query);
    setResult(res);
    setRunning(false);
  }, [sql]);

  useEffect(() => {
    setSql(initialSql);
    setResult(null);
  }, [initialSql]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      run();
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-5 gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-600 uppercase tracking-wider">SQL Editor</span>
          <span className="text-[10px] text-gray-700">Ctrl+Enter to run</span>
        </div>
        <textarea
          ref={textareaRef}
          value={sql}
          onChange={e => setSql(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full bg-gray-900 border border-gray-700 focus:border-blue-500 rounded px-4 py-3 text-xs text-gray-200 outline-none font-mono resize-none h-40 transition-colors placeholder-gray-700"
          placeholder="SELECT * FROM your_table LIMIT 100;"
          spellCheck={false}
        />
        <div className="flex justify-end">
          <button
            onClick={() => run()}
            disabled={running || !sql.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded text-xs font-medium text-white transition-colors"
          >
            {running ? <Spinner /> : (
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
            )}
            Run Query
          </button>
        </div>
      </div>
      {result && <QueryResultTable result={result} />}
    </div>
  );
}

// ─── Schema View ───────────────────────────────────────────────────────────────

function SchemaView({
  tableName, columns, primaryKeys, onAddColumn, onEditColumn, onDeleteColumn,
}: {
  tableName: string;
  columns: Column[];
  primaryKeys: string[];
  onAddColumn: () => void;
  onEditColumn: (col: Column) => void;
  onDeleteColumn: (col: Column) => void;
}) {
  return (
    <div className="flex-1 overflow-auto p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] text-gray-600 uppercase tracking-wider">
          {columns.length} column{columns.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={onAddColumn}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs text-white font-medium transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Column
        </button>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left py-2 px-3 text-[10px] text-gray-600 font-medium uppercase tracking-wider w-8">#</th>
            <th className="text-left py-2 px-3 text-[10px] text-gray-600 font-medium uppercase tracking-wider">Column</th>
            <th className="text-left py-2 px-3 text-[10px] text-gray-600 font-medium uppercase tracking-wider">Type</th>
            <th className="text-left py-2 px-3 text-[10px] text-gray-600 font-medium uppercase tracking-wider">Nullable</th>
            <th className="text-left py-2 px-3 text-[10px] text-gray-600 font-medium uppercase tracking-wider">Default</th>
            <th className="w-20"></th>
          </tr>
        </thead>
        <tbody>
          {columns.map((col, i) => {
            const isPk = primaryKeys.includes(col.column_name);
            return (
              <tr key={col.column_name} className="border-b border-gray-800/40 hover:bg-gray-800/20 group">
                <td className="py-2.5 px-3 text-gray-700">{i + 1}</td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-100 font-medium">{col.column_name}</span>
                    {isPk && (
                      <span className="text-[9px] bg-yellow-900/50 text-yellow-500 px-1.5 py-0.5 rounded font-medium">PK</span>
                    )}
                  </div>
                </td>
                <td className="py-2.5 px-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${typeColor(col.data_type)}`}>
                    {col.data_type}
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    col.is_nullable === 'YES' ? 'bg-yellow-900/30 text-yellow-500' : 'bg-gray-800 text-gray-500'
                  }`}>
                    {col.is_nullable === 'YES' ? 'nullable' : 'not null'}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-gray-600">
                  {col.column_default
                    ? <code className="text-[10px] bg-gray-800 px-1.5 py-0.5 rounded text-gray-400">{col.column_default}</code>
                    : <span className="text-gray-800">—</span>}
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onEditColumn(col)}
                      className="p-1 text-gray-600 hover:text-blue-400 transition-colors"
                      title="Rename column"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onDeleteColumn(col)}
                      className="p-1 text-gray-600 hover:text-red-400 transition-colors"
                      title="Drop column"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Data View ─────────────────────────────────────────────────────────────────

function DataView({
  tableName, columns, primaryKeys, rows, total, page, totalPages,
  loading, onPageChange, onInsertRow, onEditRow, onDeleteRow,
}: {
  tableName: string;
  columns: Column[];
  primaryKeys: string[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  onPageChange: (p: number) => void;
  onInsertRow: () => void;
  onEditRow: (row: Record<string, unknown>) => void;
  onDeleteRow: (row: Record<string, unknown>) => void;
}) {
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-800 flex-shrink-0">
        <span className="text-[10px] text-gray-600">
          {total > 0 ? `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()} rows` : `${total} rows`}
        </span>
        <button
          onClick={onInsertRow}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs text-white font-medium transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Insert Row
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 gap-2 text-gray-600 text-xs">
            <Spinner /> Loading...
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-xs text-gray-700">No rows</div>
        ) : (
          <table className="w-full text-xs border-collapse min-w-max">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-gray-800 bg-gray-950">
                <th className="w-16 py-2 px-2 bg-gray-950 border-r border-gray-800/50"></th>
                {columns.map(col => (
                  <th key={col.column_name} className="text-left py-2 px-3 whitespace-nowrap border-r border-gray-800/50 last:border-r-0 bg-gray-950">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-300 font-medium">{col.column_name}</span>
                      {primaryKeys.includes(col.column_name) && (
                        <span className="text-[9px] bg-yellow-900/50 text-yellow-600 px-1 rounded">PK</span>
                      )}
                    </div>
                    <div className="text-[9px] text-gray-700 mt-0.5 font-normal">{col.data_type}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-gray-800/30 hover:bg-gray-800/20 group">
                  <td className="py-1.5 px-2 border-r border-gray-800/20">
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onEditRow(row)}
                        className="p-1 text-gray-600 hover:text-blue-400 transition-colors"
                        title="Edit row"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => onDeleteRow(row)}
                        className="p-1 text-gray-600 hover:text-red-400 transition-colors"
                        title="Delete row"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                  {columns.map(col => (
                    <td
                      key={col.column_name}
                      className="py-2 px-3 border-r border-gray-800/20 last:border-r-0 max-w-xs"
                      title={row[col.column_name] != null ? String(row[col.column_name]) : 'NULL'}
                    >
                      <div className="truncate"><CellValue value={row[col.column_name]} /></div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-t border-gray-800 px-5 py-2.5 flex items-center justify-end gap-2 flex-shrink-0 bg-gray-900/20">
          <button onClick={() => onPageChange(1)} disabled={page === 1 || loading}
            className="px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded border border-gray-700 text-gray-400 transition-colors">
            First
          </button>
          <button onClick={() => onPageChange(page - 1)} disabled={page === 1 || loading}
            className="px-3 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded border border-gray-700 text-gray-400 transition-colors">
            Prev
          </button>
          <span className="text-[11px] text-gray-500 px-1">{page} / {totalPages}</span>
          <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages || loading}
            className="px-3 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded border border-gray-700 text-gray-400 transition-colors">
            Next
          </button>
          <button onClick={() => onPageChange(totalPages)} disabled={page === totalPages || loading}
            className="px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded border border-gray-700 text-gray-400 transition-colors">
            Last
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [tables, setTables] = useState<string[]>([]);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [loadingTables, setLoadingTables] = useState(true);
  const [search, setSearch] = useState('');

  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('schema');
  const [tableState, setTableState] = useState<TableState | null>(null);
  const [loadingTable, setLoadingTable] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);

  // Modals
  const [addColModal, setAddColModal] = useState(false);
  const [editColModal, setEditColModal] = useState<Column | null>(null);
  const [deleteColModal, setDeleteColModal] = useState<Column | null>(null);
  const [addRowModal, setAddRowModal] = useState(false);
  const [editRowModal, setEditRowModal] = useState<Record<string, unknown> | null>(null);
  const [deleteRowModal, setDeleteRowModal] = useState<Record<string, unknown> | null>(null);

  // Global query mode (no table selected, just SQL editor)
  const [globalQuery, setGlobalQuery] = useState(false);

  useEffect(() => {
    fetch('/api/tables')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setTables(data.tables ?? []);
      })
      .catch(e => setTablesError(e.message))
      .finally(() => setLoadingTables(false));
  }, []);

  const loadTable = useCallback(async (name: string, keepPage = false) => {
    const currentPage = keepPage && tableState?.page ? tableState.page : 1;
    setSelectedTable(name);
    setGlobalQuery(false);
    if (!keepPage) setActiveTab('schema');
    setTableError(null);
    setLoadingTable(true);

    try {
      const [schemaRes, rowsRes] = await Promise.all([
        fetch(`/api/table/${encodeURIComponent(name)}/schema`),
        fetch(`/api/table/${encodeURIComponent(name)}/rows?page=${currentPage}`),
      ]);
      const schema = await schemaRes.json();
      const rowData = await rowsRes.json();
      if (schema.error) throw new Error(schema.error);
      if (rowData.error) throw new Error(rowData.error);
      setTableState({
        columns: schema.columns ?? [],
        primaryKeys: schema.primaryKeys ?? [],
        rows: rowData.rows ?? [],
        total: rowData.total ?? 0,
        page: currentPage,
      });
    } catch (e) {
      setTableError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingTable(false);
    }
  }, [tableState?.page]);

  const loadPage = useCallback(async (newPage: number) => {
    if (!selectedTable) return;
    setLoadingRows(true);
    try {
      const res = await fetch(`/api/table/${encodeURIComponent(selectedTable)}/rows?page=${newPage}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTableState(prev => prev ? { ...prev, rows: data.rows ?? [], total: data.total ?? 0, page: newPage } : null);
    } catch (e) {
      setTableError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingRows(false);
    }
  }, [selectedTable]);

  const refreshSchema = useCallback(() => {
    if (selectedTable) loadTable(selectedTable, true);
  }, [selectedTable, loadTable]);

  const refreshRows = useCallback(() => {
    if (selectedTable) loadPage(tableState?.page ?? 1);
  }, [selectedTable, tableState?.page, loadPage]);

  // Delete column handler
  const handleDeleteColumn = useCallback(async (col: Column) => {
    if (!selectedTable) return;
    const res = await execute(`ALTER TABLE "${selectedTable}" DROP COLUMN "${col.column_name}"`);
    if (res.error) throw new Error(res.error);
    refreshSchema();
  }, [selectedTable, refreshSchema]);

  // Delete row handler
  const handleDeleteRow = useCallback(async (row: Record<string, unknown>) => {
    if (!selectedTable || !tableState) return;
    const where = buildWhere(row, tableState.primaryKeys, tableState.columns);
    const res = await execute(`DELETE FROM "${selectedTable}" WHERE ${where}`);
    if (res.error) throw new Error(res.error);
    refreshRows();
  }, [selectedTable, tableState, refreshRows]);

  const filteredTables = tables.filter(t =>
    t.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = tableState ? Math.ceil(tableState.total / PAGE_SIZE) : 0;

  const queryInitialSql = selectedTable
    ? `SELECT *\nFROM "${selectedTable}"\nLIMIT 100;`
    : '';

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 flex flex-col bg-gray-900 border-r border-gray-800">
        <div className="px-4 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-widest">DB Visualizer</span>
          </div>
          <p className="text-[10px] text-gray-600 mt-1 ml-6">AWS RDS · PostgreSQL</p>
        </div>

        {/* Global SQL button */}
        <div className="px-3 pt-3 pb-2 border-b border-gray-800">
          <button
            onClick={() => { setGlobalQuery(true); setSelectedTable(null); setActiveTab('query'); }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded text-xs transition-colors ${
              globalQuery
                ? 'bg-blue-600/20 text-blue-300 border border-blue-700/50'
                : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300 border border-transparent'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            SQL Editor
          </button>
        </div>

        <div className="px-3 py-2 border-b border-gray-800">
          <input
            type="text"
            placeholder="Search tables..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 focus:border-blue-500 rounded px-3 py-1.5 text-xs text-gray-300 placeholder-gray-600 outline-none transition-colors"
          />
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {loadingTables && <div className="px-4 py-3 text-xs text-gray-600">Loading tables...</div>}
          {tablesError && <div className="px-4 py-3 text-xs text-red-400">{tablesError}</div>}
          {filteredTables.map(table => (
            <button
              key={table}
              onClick={() => loadTable(table)}
              className={`w-full text-left flex items-center gap-2 px-4 py-2 text-xs transition-colors ${
                selectedTable === table && !globalQuery
                  ? 'bg-blue-600/20 text-blue-300 border-r-2 border-blue-500'
                  : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
              }`}
            >
              <svg className="w-3 h-3 flex-shrink-0 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 4v16M14 4v16M6 4h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2z" />
              </svg>
              <span className="truncate">{table}</span>
            </button>
          ))}
          {!loadingTables && !tablesError && filteredTables.length === 0 && (
            <p className="px-4 py-3 text-xs text-gray-700">No tables found</p>
          )}
        </div>

        <div className="px-4 py-2 border-t border-gray-800 text-[10px] text-gray-700">
          {tables.length} table{tables.length !== 1 ? 's' : ''}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden bg-gray-950">
        {/* Global SQL Editor */}
        {globalQuery ? (
          <>
            <div className="px-6 py-4 border-b border-gray-800 bg-gray-900/40 flex-shrink-0">
              <h2 className="text-base font-semibold text-white">SQL Editor</h2>
              <p className="text-[11px] text-gray-500 mt-0.5">Run queries against the database</p>
            </div>
            <QueryView initialSql="" />
          </>
        ) : !selectedTable ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <svg className="w-12 h-12 text-gray-800 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
            <p className="text-gray-500 text-sm font-medium">Select a table to explore</p>
            <p className="text-gray-700 text-xs mt-1">Or open the SQL Editor to run custom queries</p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="px-6 py-4 border-b border-gray-800 bg-gray-900/40 flex-shrink-0">
              <h2 className="text-base font-semibold text-white">{selectedTable}</h2>
              {tableState && !loadingTable && (
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {tableState.total.toLocaleString()} rows · {tableState.columns.length} columns
                  {tableState.primaryKeys.length > 0 && ` · PK: ${tableState.primaryKeys.join(', ')}`}
                </p>
              )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-800 px-6 flex-shrink-0">
              {(['schema', 'data', 'query'] as ActiveTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-1 py-3 mr-6 text-xs font-medium uppercase tracking-wider border-b-2 -mb-px transition-colors ${
                    activeTab === tab
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-gray-600 hover:text-gray-400'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {loadingTable ? (
              <div className="flex-1 flex items-center justify-center gap-2 text-gray-600 text-xs">
                <Spinner /> Loading...
              </div>
            ) : tableError ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-red-400 text-sm max-w-md text-center">
                  <p className="font-medium mb-1">Error</p>
                  <p className="text-xs text-red-500/80">{tableError}</p>
                </div>
              </div>
            ) : tableState && activeTab === 'schema' ? (
              <SchemaView
                tableName={selectedTable}
                columns={tableState.columns}
                primaryKeys={tableState.primaryKeys}
                onAddColumn={() => setAddColModal(true)}
                onEditColumn={col => setEditColModal(col)}
                onDeleteColumn={col => setDeleteColModal(col)}
              />
            ) : tableState && activeTab === 'data' ? (
              <DataView
                tableName={selectedTable}
                columns={tableState.columns}
                primaryKeys={tableState.primaryKeys}
                rows={tableState.rows}
                total={tableState.total}
                page={tableState.page}
                totalPages={totalPages}
                loading={loadingRows}
                onPageChange={loadPage}
                onInsertRow={() => setAddRowModal(true)}
                onEditRow={row => setEditRowModal(row)}
                onDeleteRow={row => setDeleteRowModal(row)}
              />
            ) : tableState && activeTab === 'query' ? (
              <QueryView initialSql={queryInitialSql} />
            ) : null}
          </>
        )}
      </main>

      {/* Modals */}
      {addColModal && selectedTable && (
        <AddColumnModal
          tableName={selectedTable}
          onClose={() => setAddColModal(false)}
          onSuccess={refreshSchema}
        />
      )}
      {editColModal && selectedTable && (
        <EditColumnModal
          tableName={selectedTable}
          column={editColModal}
          onClose={() => setEditColModal(null)}
          onSuccess={refreshSchema}
        />
      )}
      {deleteColModal && (
        <ConfirmModal
          message={`Drop column "${deleteColModal.column_name}" from "${selectedTable}"? This cannot be undone.`}
          onConfirm={() => handleDeleteColumn(deleteColModal)}
          onClose={() => setDeleteColModal(null)}
        />
      )}
      {addRowModal && selectedTable && tableState && (
        <AddRowModal
          tableName={selectedTable}
          columns={tableState.columns}
          onClose={() => setAddRowModal(false)}
          onSuccess={refreshRows}
        />
      )}
      {editRowModal && selectedTable && tableState && (
        <EditRowModal
          tableName={selectedTable}
          columns={tableState.columns}
          row={editRowModal}
          primaryKeys={tableState.primaryKeys}
          onClose={() => setEditRowModal(null)}
          onSuccess={refreshRows}
        />
      )}
      {deleteRowModal && tableState && (
        <ConfirmModal
          message={`Delete this row from "${selectedTable}"? This cannot be undone.`}
          onConfirm={() => handleDeleteRow(deleteRowModal)}
          onClose={() => setDeleteRowModal(null)}
        />
      )}
    </div>
  );
}
