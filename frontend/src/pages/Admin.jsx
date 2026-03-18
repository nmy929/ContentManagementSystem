import React, { useEffect, useState } from 'react';
import api from '../api';

export default function Admin({ role }) {
  const [metrics, setMetrics] = useState([]);
  const [sql, setSql] = useState('SELECT * FROM articles LIMIT 5');
  const [label, setLabel] = useState('custom');
  const [explain, setExplain] = useState('');
  const [categoryId, setCategoryId] = useState('1');
  const [olderThan, setOlderThan] = useState('365');
  const [indexSql, setIndexSql] = useState('CREATE INDEX idx_articles_published_at ON articles(published_at DESC);');
  const [vacuumTable, setVacuumTable] = useState('articles');
  const [concurrency, setConcurrency] = useState('100');
  const [ops, setOps] = useState('1000');
  const [message, setMessage] = useState('');

  const loadMetrics = async () => {
    const res = await api.get('/api/metrics/latest');
    setMetrics(res.data.rows || []);
  };

  useEffect(() => {
    if (role === 'admin') {
      loadMetrics();
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

  const runBulk = async () => {
    setMessage('');
    const res = await api.post('/api/admin/bulk_unpublish', {
      category_id: Number(categoryId),
      older_than_days: Number(olderThan)
    });
    setMessage(`Bulk unpublish done. Artifact: ${res.data.artifact}`);
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
    const res = await api.post('/api/admin/run_vacuum', { table: vacuumTable });
    setMessage(`Vacuum done. Artifact: ${res.data.artifact}`);
    loadMetrics();
  };

  const runLoadTest = async () => {
    setMessage('');
    const res = await api.post('/api/admin/run_load_test', {
      target: 'article_views',
      concurrency: Number(concurrency),
      ops: Number(ops)
    });
    setMessage(`Load test ${res.data.status}`);
  };

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
        <h2>Bulk Unpublish</h2>
        <label>Category ID</label>
        <input value={categoryId} onChange={(e) => setCategoryId(e.target.value)} />
        <label>Older Than Days</label>
        <input value={olderThan} onChange={(e) => setOlderThan(e.target.value)} />
        <button onClick={runBulk}>Run Bulk</button>
      </div>

      <div className="card">
        <h2>Index Control</h2>
        <label>Index SQL</label>
        <textarea rows="3" value={indexSql} onChange={(e) => setIndexSql(e.target.value)} />
        <div>
          <button onClick={runCreateIndex}>Create Index</button>
          <button className="secondary" onClick={runDropIndex}>Drop Index (simple replace)</button>
        </div>
      </div>

      <div className="card">
        <h2>VACUUM</h2>
        <label>Table</label>
        <input value={vacuumTable} onChange={(e) => setVacuumTable(e.target.value)} />
        <button onClick={runVacuum}>Run Vacuum</button>
      </div>

      <div className="card">
        <h2>Load Test</h2>
        <label>Concurrency</label>
        <input value={concurrency} onChange={(e) => setConcurrency(e.target.value)} />
        <label>Ops</label>
        <input value={ops} onChange={(e) => setOps(e.target.value)} />
        <button onClick={runLoadTest}>Run Load Test</button>
      </div>

      {message && <div className="card">{message}</div>}

      <div className="card">
        <h2>Experiment Results</h2>
        <button onClick={loadMetrics}>Refresh</button>
        {metrics.map((row) => (
          <div key={row.id}>
            <strong>{row.operation}</strong> - {row.created_at} - {row.artifact_path}
          </div>
        ))}
      </div>
    </div>
  );
}
