import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';

export default function Article({ role }) {
  const { id } = useParams();
  const [article, setArticle] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get(`/api/articles/${id}`);
        setArticle(res.data);
        await api.post(`/api/articles/${id}/view`);
      } catch (err) {
        setError('Failed to load article.');
      }
    };
    load();
  }, [id]);

  if (error) {
    return <div className="card">{error}</div>;
  }

  if (!article) {
    return <div className="card">Loading...</div>;
  }

  return (
    <div className="card">
      <h2>{article.title}</h2>
      <p>Status: {article.status}</p>
      <p>Views: {article.views_count}</p>
      <p>{article.content}</p>
      {(role === 'author' || role === 'editor' || role === 'admin') && (
        <Link to={`/editor/${article.article_id}`}>Edit this article</Link>
      )}
    </div>
  );
}
