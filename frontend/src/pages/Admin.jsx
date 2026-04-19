import React, { useEffect, useState } from 'react';
import api from '../api';
import formatDateTime from '../utils/formatDateTime';

export default function Admin({ role }) {
  const [metrics, setMetrics] = useState([]);
  const [sql, setSql] = useState('SELECT * FROM articles LIMIT 5');
  const [label, setLabel] = useState('custom');
  const [explain, setExplain] = useState('');
  const [categoryId, setCategoryId] = useState('1');
  const [bulkSourceStatus, setBulkSourceStatus] = useState('published');
  const [bulkTargetStatus, setBulkTargetStatus] = useState('archived');
  const [bulkPreviewCount, setBulkPreviewCount] = useState(null);
  const [bulkMvccBefore, setBulkMvccBefore] = useState(null);
  const [bulkMvccAfter, setBulkMvccAfter] = useState(null);
  const [indexSql, setIndexSql] = useState('CREATE INDEX idx_articles_published_at ON articles(published_at DESC);');
  const [autovacuumEnabled, setAutovacuumEnabled] = useState(true);
  const [autovacuumStatus, setAutovacuumStatus] = useState(null);
  const [concurrency, setConcurrency] = useState('100');
  const [ops, setOps] = useState('1000');
  const [loadTestResult, setLoadTestResult] = useState(null);
  const [loadTestResultId, setLoadTestResultId] = useState(null);
  const [loadTestBefore, setLoadTestBefore] = useState(null);
  const [loadTestAfter, setLoadTestAfter] = useState(null);
  const [message, setMessage] = useState('');

  const normalizeJsonParams = (value) => {
    if (!value) return null;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (e) {
        return null;
      }
    }
    if (typeof value === 'object') return value;
    return null;
  };

  const loadMetrics = async () => {
    const res = await api.get('/api/metrics/latest');
    setMetrics(res.data.rows || []);
  };

  const fetchArticleViewsSnapshot = async () => {
    const res = await api.get('/api/admin/article_views_snapshot');
    return res.data?.data || null;
  };

  const fetchArticlesMvccSample = async ({ category_id, limit = 5 }) => {
    const res = await api.get('/api/admin/articles_mvcc_sample', { params: { category_id, limit } });
    return res.data?.data || null;
  };

  useEffect(() => {
    if (role === 'admin') {
      loadMetrics();
      fetchStorageStatus({ silent: true });
      loadLatestLoadTest({ silent: true });
    }
  }, [role]);

  if (role !== 'admin') {
    return <div className="card">Admin only.</div>;
  }

  const runExplain = async () => {
    setMessage('');
    const res = await api.post('/api/admin/run_explain', { sql, label });
    setExplain(res.data.explain_text || '');
    setMessage(`Saved artifact ${res.data.artifact}`);
    loadMetrics();
  };

  const fetchStorageStatus = async ({ silent } = { silent: false }) => {
    if (!silent) setMessage('');
    const res = await api.get('/api/admin/autovacuum_status', { params: { table: 'articles' } });
    const data = res.data.data;
    setAutovacuumStatus(data);
    setAutovacuumEnabled(!(data && data.table_autovacuum_enabled_setting === false));
  };

  const loadLatestLoadTest = async ({ silent } = { silent: false }) => {
    if (!silent) setMessage('');
    const res = await api.get('/api/metrics/latest', { params: { operation: 'load_test', limit: 1 } });
    const row = res.data?.rows?.[0];
    setLoadTestResult(normalizeJsonParams(row?.params));
    setLoadTestResultId(row?.id ?? null);
  };

  const pollLatestLoadTest = async ({ afterId = null, timeoutMs = 15000, intervalMs = 1000 } = {}) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await api.get('/api/metrics/latest', { params: { operation: 'load_test', limit: 1 } });
        const row = res.data?.rows?.[0];
        const parsed = normalizeJsonParams(row?.params);
        if (parsed && (afterId == null || (row?.id != null && row.id > afterId))) {
          setLoadTestResult(parsed);
          setLoadTestResultId(row?.id ?? null);
          return;
        }
      } catch (e) {
        // ignore and retry
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  };

  const applyAutovacuum = async () => {
    setMessage('');
    const res = await api.post('/api/admin/set_autovacuum', {
      table: 'articles',
      enabled: autovacuumEnabled
    });
    setAutovacuumStatus(res.data.data || null);
    setMessage(`Autovacuum updated. Artifact: ${res.data.artifact}`);
    fetchStorageStatus({ silent: true });
    loadMetrics();
  };

  const previewBulkStatusChange = async () => {
    setMessage('');
    setBulkPreviewCount(null);
    setBulkMvccBefore(null);
    setBulkMvccAfter(null);
    try {
      const before = await fetchArticlesMvccSample({ category_id: Number(categoryId), limit: 5 });
      setBulkMvccBefore(before);
    } catch (e) {
      setBulkMvccBefore(null);
    }
    const res = await api.post('/api/admin/bulk_status_change/preview', {
      category_id: Number(categoryId),
      source_status: bulkSourceStatus,
      target_status: bulkTargetStatus
    });
    setBulkPreviewCount(res.data.count);
    setMessage(`Preview: will update ${res.data.count} rows`);
  };

  const renderMvccTable = (rows) => {
    if (!rows || rows.length === 0) return <div style={{ color: '#6b6b6b' }}>No rows</div>;
    return (
      <table className="kv-table">
        <thead>
          <tr>
            <th>article_id</th>
            <th>ctid</th>
            <th>xmin</th>
            <th>xmax</th>
            <th>status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.article_id}-${r.ctid}`}>
              <td>{r.article_id}</td>
              <td>{r.ctid}</td>
              <td>{r.xmin}</td>
              <td>{r.xmax}</td>
              <td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const applyBulkStatusChange = async () => {
    if (!bulkPreviewCount || bulkPreviewCount <= 0) return;
    if (!window.confirm(`Apply bulk status change to ${bulkPreviewCount} rows?`)) return;
    setMessage('');
    const res = await api.post('/api/admin/bulk_status_change/apply', {
      category_id: Number(categoryId),
      source_status: bulkSourceStatus,
      target_status: bulkTargetStatus
    });
    setMessage(`Bulk status change done (${res.data.updated_rows}). Artifact: ${res.data.artifact}`);
    try {
      const after = await fetchArticlesMvccSample({ category_id: Number(categoryId), limit: 5 });
      setBulkMvccAfter(after);
    } catch (e) {
      setBulkMvccAfter(null);
    }
    fetchStorageStatus({ silent: true });
    loadMetrics();
  };

  const runCreateIndex = async () => {
    setMessage('');
    const res = await api.post('/api/admin/create_index', { index_sql: indexSql });
    setMessage(`Index created. Artifact: ${res.data.artifact}`);
    loadMetrics();
  };

  const runDropIndex = async () => {
    setMessage('');
    const res = await api.post('/api/admin/drop_index', { index_sql: indexSql.replace('CREATE', 'DROP') });
    setMessage(`Index dropped. Artifact: ${res.data.artifact}`);
    loadMetrics();
  };

  const runVacuum = async () => {
    setMessage('');
    const res = await api.post('/api/admin/run_vacuum', { table: 'articles' });
    setMessage(`Vacuum done. Artifact: ${res.data.artifact}`);
    fetchStorageStatus({ silent: true });
    loadMetrics();
  };

  const runLoadTest = async () => {
    setMessage('');
    const latest = await api.get('/api/metrics/latest', { params: { operation: 'load_test', limit: 1 } });
    const prevId = latest.data?.rows?.[0]?.id ?? null;
    const res = await api.post('/api/admin/run_load_test', {
      target: 'article_views',
      concurrency: 100,
      ops: 1000
    });
    setMessage(`Load test ${res.data.status}`);
    fetchStorageStatus({ silent: true });
    await pollLatestLoadTest({ afterId: prevId });
  };

  const storageLive = autovacuumStatus?.pg_stat_user_tables?.n_live_tup;
  const storageDead = autovacuumStatus?.pg_stat_user_tables?.n_dead_tup;
  const autovacuumIsOff = autovacuumStatus?.table_autovacuum_enabled_setting === false;

  return (
    <div>
      <div className="card">
        <h2>EXPLAIN Runner</h2>
        <label>SQL</label>
        <textarea rows="4" value={sql} onChange={(e) => setSql(e.target.value)} />
        <label>Label</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)} />
        <button onClick={runExplain}>Run EXPLAIN</button>
        {explain && <pre>{explain}</pre>}
      </div>

      <div className="card">
        <h2>Index Control</h2>
        <label>Index SQL</label>
        <textarea rows="3" value={indexSql} onChange={(e) => setIndexSql(e.target.value)} />
        <div className="button-row">
          <button onClick={runCreateIndex}>Create Index</button>
          <button className="secondary" onClick={runDropIndex}>Drop Index (simple replace)</button>
        </div>
      </div>

      <div className="card">
        <h2>Load Test</h2>
        <label>Concurrency</label>
        <input value={concurrency} onChange={(e) => setConcurrency(e.target.value)} disabled />
        <label>Ops</label>
        <input value={ops} onChange={(e) => setOps(e.target.value)} disabled />
        <div className="button-stack">
          <div className="button-row">
            <button
              className="secondary"
              onClick={async () => {
                setMessage('');
                const snap = await fetchArticleViewsSnapshot();
                setLoadTestBefore(snap);
                setMessage('Captured Before load test snapshot');
              }}
            >
              Capture Before
            </button>
            <button
              className="secondary"
              onClick={async () => {
                setMessage('');
                const snap = await fetchArticleViewsSnapshot();
                setLoadTestAfter(snap);
                setMessage('Captured After load test snapshot');
              }}
            >
              Capture After
            </button>
          </div>
          <div className="button-row">
            <button onClick={runLoadTest}>Run Load Test</button>
            <button className="secondary" onClick={() => loadLatestLoadTest()}>Refresh Result</button>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <h3 style={{ marginBottom: 6 }}>Before/After: article_views count + WAL LSN</h3>
          <div className="two-col">
            <pre className="kv-pre">{`Before load test:\nselect count(*) from article_views;\nselect pg_current_wal_lsn();\n\ncount: ${loadTestBefore?.count ?? '-'}\nwal_lsn: ${loadTestBefore?.wal_lsn ?? '-'}\ncaptured_at: ${loadTestBefore?.captured_at ?? '-'}`}</pre>
            <pre className="kv-pre">{`After load test:\nselect count(*) from article_views;\nselect pg_current_wal_lsn();\n\ncount: ${loadTestAfter?.count ?? '-'}\nwal_lsn: ${loadTestAfter?.wal_lsn ?? '-'}\ncaptured_at: ${loadTestAfter?.captured_at ?? '-'}`}</pre>
          </div>
        </div>
        {loadTestResult && (
          <div style={{ marginTop: 12 }}>
            <pre className="kv-pre">{`Target: ${loadTestResult.target}\nConcurrency: ${loadTestResult.concurrency}\nOps: ${loadTestResult.ops}\nDuration: ${loadTestResult.duration_sec}\nTPS: ${loadTestResult.tps}\nErrors: ${loadTestResult.errors}\nStarted: ${loadTestResult.started_at}\nEnded: ${loadTestResult.ended_at}`}</pre>
            {loadTestResultId != null && (
              <div style={{ marginTop: 6, color: '#6b6b6b' }}>Result id: {loadTestResultId}</div>
            )}
          </div>
        )}
        {!loadTestResult && (
          <div style={{ marginTop: 10, color: '#6b6b6b' }}>
            No load test results yet. Run a load test, then click Refresh Result.
          </div>
        )}
      </div>

      <div className="card">
        <h2>Autovacuum</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button onClick={() => fetchStorageStatus()}>Refresh</button>
          <div>Current: {autovacuumIsOff ? 'OFF' : 'ON'}</div>
          <div>Table: articles</div>
        </div>
        <label>
          <input
            type="checkbox"
            checked={autovacuumEnabled}
            onChange={(e) => setAutovacuumEnabled(e.target.checked)}
          />{' '}
          autovacuum_enabled (table)
        </label>
        <div>
          <button className="secondary" onClick={applyAutovacuum}>Apply</button>
        </div>
        <div style={{ marginTop: 8 }}>
          <h3 style={{ marginBottom: 6 }}>Storage Stats</h3>
          <div>n_live_tup: {storageLive ?? '-'}</div>
          <div>n_dead_tup: {storageDead ?? '-'}</div>
        </div>
      </div>

      <div className="card">
        <h2>Bulk Status Change</h2>
        <label>Source Status</label>
        <select
          value={bulkSourceStatus}
          onChange={(e) => {
            setBulkSourceStatus(e.target.value);
            setBulkPreviewCount(null);
          }}
        >
          <option value="published">published</option>
          <option value="draft">draft</option>
        </select>
        <label>Target Status</label>
        <select
          value={bulkTargetStatus}
          onChange={(e) => {
            setBulkTargetStatus(e.target.value);
            setBulkPreviewCount(null);
          }}
        >
          <option value="published">published</option>
          <option value="draft">draft</option>
          <option value="archived">archived</option>
        </select>
        <label>Category ID</label>
        <input
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setBulkPreviewCount(null);
          }}
        />
        <div className="button-row">
          <button onClick={previewBulkStatusChange}>Preview</button>
          <button
            className="secondary"
            onClick={applyBulkStatusChange}
            disabled={bulkPreviewCount === 0 || bulkPreviewCount === null}
          >
            Apply
          </button>
        </div>
        {bulkPreviewCount !== null && (
          <div style={{ marginTop: 8 }}>Will update {bulkPreviewCount} rows</div>
        )}
        {bulkMvccBefore && (
          <div style={{ marginTop: 12 }}>
            <h3 style={{ marginBottom: 6 }}>MVCC Sample (ctid/xmin/xmax)</h3>
            <div style={{ marginBottom: 8, color: '#6b6b6b' }}>
              SELECT article_id, ctid, xmin, xmax, status FROM articles WHERE category_id = {categoryId} ORDER BY
              article_id LIMIT 5;
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>Before</strong>
            </div>
            {renderMvccTable(bulkMvccBefore?.rows || [])}
          </div>
        )}
        {bulkMvccAfter && (
          <div style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 8 }}>
              <strong>After</strong>
            </div>
            {renderMvccTable(bulkMvccAfter?.rows || [])}
          </div>
        )}
      </div>

      <div className="card">
        <h2>VACUUM</h2>
        <div>Table: articles</div>
        <button onClick={runVacuum}>VACUUM articles</button>
      </div>

      {message && <div className="card">{message}</div>}

      <div className="card">
        <h2>Experiment Results</h2>
        <button onClick={loadMetrics}>Refresh</button>
        {metrics.map((row) => (
          <div key={row.id}>
            <strong>{row.operation}</strong> - {formatDateTime(row.created_at)} - {row.artifact_path}
          </div>
        ))}
      </div>
    </div>
  );
}
