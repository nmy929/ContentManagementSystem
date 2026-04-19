import React, { useEffect, useMemo, useState } from 'react';
import api from '../api';
import formatDateTime from '../utils/formatDateTime';
import TagMultiSelect from '../components/TagMultiSelect';

function buildDemoSql(categoryId) {
  return [
    'SELECT title, published_at',
    'FROM articles',
    `WHERE category_id = ${Number(categoryId)}`,
    'ORDER BY published_at DESC',
    'LIMIT 200;'
  ].join('\n');
}

const CANONICAL_CATEGORY_INDEX_SQL = [
  'CREATE INDEX idx_articles_category_published',
  'ON articles(category_id, published_at DESC)',
  'INCLUDE (title);'
].join('\n');

function getPresetTagIds(tagRows, preset) {
  const ids = tagRows.map((t) => String(t.tag_id));
  if (preset === 'common') {
    return ids.slice(0, 5);
  }
  return ids.slice(Math.max(0, ids.length - 3));
}

export default function Admin({ role }) {
  const [metrics, setMetrics] = useState([]);
  const [sql, setSql] = useState('');
  const [label, setLabel] = useState('category_newest_demo');
  const [explain, setExplain] = useState('');
  const [categoryId, setCategoryId] = useState('1');
  const [bulkSourceStatus, setBulkSourceStatus] = useState('published');
  const [bulkTargetStatus, setBulkTargetStatus] = useState('archived');
  const [bulkPreviewCount, setBulkPreviewCount] = useState(null);
  const [bulkMvccBefore, setBulkMvccBefore] = useState(null);
  const [bulkMvccAfter, setBulkMvccAfter] = useState(null);
  const [categoryIndexStatus, setCategoryIndexStatus] = useState('Unknown');
  const [categoryIndexList, setCategoryIndexList] = useState([]);
  const [autovacuumEnabled, setAutovacuumEnabled] = useState(true);
  const [autovacuumStatus, setAutovacuumStatus] = useState(null);
  const [concurrency, setConcurrency] = useState('100');
  const [ops, setOps] = useState('1000');
  const [loadTestResult, setLoadTestResult] = useState(null);
  const [loadTestResultId, setLoadTestResultId] = useState(null);
  const [loadTestBefore, setLoadTestBefore] = useState(null);
  const [loadTestAfter, setLoadTestAfter] = useState(null);
  const [message, setMessage] = useState('');
  const [ginStatus, setGinStatus] = useState(null);
  const [categories, setCategories] = useState([]);
  const [demoCategoryId, setDemoCategoryId] = useState('');

  const [tags, setTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [benchmarkMode, setBenchmarkMode] = useState('all');
  const [benchmarkRuns, setBenchmarkRuns] = useState('3');
  const [benchmarkSummary, setBenchmarkSummary] = useState(null);
  const [benchmarkExplain, setBenchmarkExplain] = useState('');
  const [benchmarkQuery, setBenchmarkQuery] = useState('');
  const [benchmarkMatchedCount, setBenchmarkMatchedCount] = useState(0);
  const [benchmarkSampleIds, setBenchmarkSampleIds] = useState([]);
  const [benchmarkTimes, setBenchmarkTimes] = useState([]);
  const [benchmarkMedian, setBenchmarkMedian] = useState(null);

  const selectedTagNames = useMemo(() => {
    const nameMap = new Map(tags.map((t) => [String(t.tag_id), t.name]));
    return selectedTags.map((id) => nameMap.get(id) || id);
  }, [tags, selectedTags]);

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

  const loadTags = async () => {
    const res = await api.get('/api/tags');
    const rows = res.data.rows || [];
    setTags(rows);
    setSelectedTags((prev) => (prev.length > 0 ? prev : getPresetTagIds(rows, 'rare')));
  };

  const loadCategories = async () => {
    try {
      const res = await api.get('/api/categories');
      const rows = res.data.rows || [];
      setCategories(rows);
      if (rows.length > 0) {
        const firstId = String(rows[0].category_id);
        setDemoCategoryId((prev) => prev || firstId);
        setSql((prev) => (prev && prev.trim() ? prev : buildDemoSql(firstId)));
      }
    } catch (err) {
      setCategories([]);
      setDemoCategoryId('1');
      setSql((prev) => (prev && prev.trim() ? prev : buildDemoSql(1)));
    }
  };

  const loadGinStatus = async () => {
    try {
      const res = await api.get('/api/admin/tags_index/status');
      setGinStatus(res.data.exists ? 'Present' : 'Missing');
    } catch (err) {
      setGinStatus('Unknown');
    }
  };

  const loadCategoryIndexStatus = async () => {
    try {
      const res = await api.get('/api/admin/category_index/status');
      setCategoryIndexStatus(res.data.canonical_exists ? 'Present' : 'Missing');
      setCategoryIndexList(res.data.indexes || []);
    } catch (err) {
      setCategoryIndexStatus('Unknown');
      setCategoryIndexList([]);
    }
  };

  useEffect(() => {
    if (role === 'admin') {
      loadMetrics();
      loadTags();
      loadGinStatus();
      loadCategoryIndexStatus();
      loadCategories();
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
    const res = await api.post('/api/admin/category_index/create');
    setMessage(`Canonical index created. Artifact: ${res.data.artifact}`);
    loadMetrics();
    loadCategoryIndexStatus();
  };

  const runDropIndex = async () => {
    setMessage('');
    const res = await api.post('/api/admin/category_index/drop');
    setMessage(`Category/published indexes dropped. Artifact: ${res.data.artifact}`);
    loadMetrics();
    loadCategoryIndexStatus();
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

  const createGin = async () => {
    await api.post('/api/admin/tags_index/create');
    setMessage('GIN index created.');
    loadGinStatus();
  };

  const dropGin = async () => {
    await api.post('/api/admin/tags_index/drop');
    setMessage('GIN index dropped.');
    loadGinStatus();
  };

  const refreshTagIndex = async () => {
    await api.post('/api/admin/refresh_tags_index');
    setMessage('Tag index refreshed.');
  };

  const runGinBenchmark = async () => {
    const ids = selectedTags.map((v) => Number(v)).filter((v) => !Number.isNaN(v));
    if (ids.length === 0) {
      setMessage('Please select at least one tag for benchmark.');
      return;
    }
    const res = await api.post('/api/admin/gin_benchmark', {
      tag_ids: ids,
      mode: benchmarkMode,
      runs: Number(benchmarkRuns) || 3
    });
    setBenchmarkSummary(res.data.explain_summary || null);
    setBenchmarkExplain(res.data.explain_text || '');
    setBenchmarkQuery(res.data.query_sql || '');
    setBenchmarkMatchedCount(res.data.matched_count || 0);
    setBenchmarkSampleIds(res.data.sample_article_ids || []);
    setBenchmarkTimes(res.data.execution_times_ms || []);
    setBenchmarkMedian(res.data.median_execution_time_ms ?? null);
    setMessage(`Benchmark complete. Artifact: ${res.data.artifact}`);
    loadMetrics();
  };

  const applyDemoSql = () => {
    if (!demoCategoryId) return;
    setSql(buildDemoSql(demoCategoryId));
  };

  return (
    <div>
      <div className="card">
        <h2>B-tree Benchmark Module (Category + Newest)</h2>
        <p>
          Purpose: compare query plans for
          <code> SELECT title, published_at FROM articles WHERE category_id = ? ORDER BY published_at DESC LIMIT 200</code>
          before/after the canonical B-tree index.
        </p>
        <p>
          Suggested flow: 1) Drop index 2) Run EXPLAIN 3) Create index 4) Run EXPLAIN again.
        </p>
      </div>

      <div className="card">
        <h3>B-tree Index Control</h3>
        <p>
          Canonical index name for this demo: <code>idx_articles_category_published</code>.
          Create will drop other competing <code>(category_id, published_at)</code> indexes first, then create this one.
          Drop will remove all competing indexes so the no-index run is clean.
        </p>
        <label>Canonical Index SQL</label>
        <pre>{CANONICAL_CATEGORY_INDEX_SQL}</pre>
        <p>Status: {categoryIndexStatus}</p>
        {categoryIndexList.length > 0 && (
          <div>
            <p>Detected competing indexes:</p>
            <ul>
              {categoryIndexList.map((idx) => (
                <li key={idx.indexname}>{idx.indexname}</li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <button onClick={runCreateIndex}>Create Canonical Index</button>
          <button className="secondary" onClick={runDropIndex}>Drop Category+Published Indexes</button>
        </div>
      </div>

      <div className="card">
        <h3>B-tree EXPLAIN Runner</h3>
        <p>
          This runner executes custom SELECT SQL and stores an artifact record.
          The <code>label</code> field is an experiment name used to tag this EXPLAIN run in experiment results and artifact metadata.
        </p>
        <label>Demo Category</label>
        <select value={demoCategoryId} onChange={(e) => setDemoCategoryId(e.target.value)}>
          {categories.map((c) => (
            <option key={c.category_id} value={c.category_id}>
              {c.category_id} - {c.name}
            </option>
          ))}
        </select>
        <button className="secondary" onClick={applyDemoSql}>Use Demo Query</button>
        <label>SQL</label>
        <textarea rows="4" value={sql} onChange={(e) => setSql(e.target.value)} />
        <label>Label</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)} />
        <button onClick={runExplain}>Run EXPLAIN</button>
        {explain && <pre>{explain}</pre>}
      </div>

      <div className="card">
        <h2>GIN Benchmark Module (Tag Array Filtering)</h2>
        <p>
          Purpose: compare <code>Seq Scan</code> vs <code>Bitmap Index Scan + Bitmap Heap Scan</code>
          on <code>articles_tag_index.tag_ids</code> using the same SQL with/without GIN.
        </p>
        <p>
          Suggested flow: 1) Drop GIN 2) Run Query 3) Create GIN 4) Run Query again.
        </p>
      </div>

      <div className="card">
        <h3>GIN Benchmark Query</h3>
        <label>Tags (multi-select)</label>
        <TagMultiSelect tags={tags} selectedIds={selectedTags} setSelectedIds={setSelectedTags} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button className="secondary" onClick={() => setSelectedTags(getPresetTagIds(tags, 'rare'))}>Use Rare Preset</button>
          <button className="secondary" onClick={() => setSelectedTags(getPresetTagIds(tags, 'common'))}>Use Common Preset</button>
        </div>
        <p>Selected tags: {selectedTagNames.join(', ') || 'N/A'}</p>
        <label>Match mode</label>
        <select value={benchmarkMode} onChange={(e) => setBenchmarkMode(e.target.value)}>
          <option value="all">ALL (contains all selected) - @&gt;</option>
          <option value="any">ANY (overlap) - &amp;&amp;</option>
        </select>
        <label>Benchmark runs (same query repeated)</label>
        <input value={benchmarkRuns} onChange={(e) => setBenchmarkRuns(e.target.value)} />
        <button onClick={runGinBenchmark}>Run Query</button>
      </div>

      <div className="card">
        <h3>GIN Index Control</h3>
        <p>Status: {ginStatus || 'Unknown'}</p>
        <button onClick={createGin}>Run with Index (Create GIN)</button>
        <button className="secondary" onClick={dropGin}>Run without Index (Drop GIN)</button>
        <button className="secondary" onClick={refreshTagIndex}>Refresh Tag Index (refresh materialized view data)</button>
      </div>

      <div className="card">
        <h3>GIN EXPLAIN and Result Summary</h3>
        <p>Rows matched: {benchmarkMatchedCount}</p>
        <p>Sample article_id: {benchmarkSampleIds.length > 0 ? benchmarkSampleIds.join(', ') : 'N/A'}</p>
        <p>Execution times (ms): {benchmarkTimes.length > 0 ? benchmarkTimes.join(', ') : 'N/A'}</p>
        <p>Median execution time (ms): {benchmarkMedian ?? 'N/A'}</p>
        <p>Query: <code>{benchmarkQuery || 'N/A'}</code></p>
        {benchmarkSummary && (
          <div>
            <p>Scan Type: {benchmarkSummary.scan_type || 'N/A'}</p>
            <p>Index Used: {benchmarkSummary.index_used || 'N/A'}</p>
            <p>Buffers: {benchmarkSummary.buffers || 'N/A'}</p>
            <p>Execution Time: {benchmarkSummary.execution_time || 'N/A'}</p>
            <p>Rows Removed by Filter: {benchmarkSummary.rows_removed_by_filter || 'N/A'}</p>
          </div>
        )}
        {benchmarkExplain && <pre>{benchmarkExplain}</pre>}
      </div>

      <div className="card">
        <h2>Storage Operations Module</h2>
        <p>
          These operations focus on storage behavior and maintenance, not index plan comparison.
        </p>
      </div>

      <div className="card">
        <h3>Bulk Unpublish</h3>
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
        <h3>Load Test</h3>
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
