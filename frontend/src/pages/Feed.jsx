import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import formatDateTime from '../utils/formatDateTime';

export default function Feed({ role }) {
  const [rows, setRows] = useState([]);
  const [category, setCategory] = useState('');
  const [explain, setExplain] = useState('');
  const [error, setError] = useState(null);

  const load = async () => {
    setError(null);
    try {
      const params = {};
      if (category) params.category = Number(category);
      const res = await api.get('/api/articles', { params });
      setRows(res.data.rows || []);
      setExplain(role === 'admin' ? res.data.explain_text || '' : '');
    } catch (err) {
      setError('Failed to load feed.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="card">
        <h2>Feed</h2>
        <label>Category ID (optional)</label>
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. 1" />
        <button onClick={load}>Refresh Feed (Collect EXPLAIN)</button>
        {error && <p>{error}</p>}
      </div>

      <div className="grid">
        {rows.map((row) => (
          <div className="card" key={row.article_id}>
            <h3>{row.title}</h3>
            <p>Author: {row.author_id}</p>
            <p>Published: {formatDateTime(row.published_at) || 'N/A'}</p>
            <Link to={`/articles/${row.article_id}`}>Open</Link>
          </div>
        ))}
      </div>

      {role === 'admin' && explain && (
        <div className="card">
          <h3>EXPLAIN (ANALYZE, BUFFERS)</h3>
          <pre>{explain}</pre>
        </div>
      )}
    </div>
  );
}
