import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';

export default function Article({ role }) {
  const { id } = useParams();
  const [article, setArticle] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [commentMessage, setCommentMessage] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [error, setError] = useState(null);

  const canComment = role === 'author' || role === 'editor' || role === 'admin';
  const canDeleteComments = role === 'editor' || role === 'admin';

  const loadComments = async () => {
    const res = await api.get(`/api/articles/${id}/comments`);
    setComments(res.data.rows || []);
  };

  const loadArticle = async () => {
    const res = await api.get(`/api/articles/${id}`);
    setArticle(res.data);
  };

  useEffect(() => {
    const load = async () => {
      try {
        await api.post(`/api/articles/${id}/view`);
        await loadArticle();
        await loadComments();
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

  const submitComment = async () => {
    const trimmed = commentText.trim();
    if (!trimmed) {
      setCommentMessage('Comment cannot be empty.');
      return;
    }

    setCommentLoading(true);
    setCommentMessage('');
    try {
      await api.post(`/api/articles/${id}/comments`, { content: trimmed });
      setCommentText('');
      setCommentMessage('Comment posted.');
      await loadArticle();
      await loadComments();
    } catch (err) {
      setCommentMessage(err.response?.data?.detail || 'Failed to post comment.');
    } finally {
      setCommentLoading(false);
    }
  };

  const deleteComment = async (commentId) => {
    setCommentLoading(true);
    setCommentMessage('');
    try {
      await api.delete(`/api/comments/${commentId}`);
      setCommentMessage('Comment deleted.');
      await loadArticle();
      await loadComments();
    } catch (err) {
      setCommentMessage(err.response?.data?.detail || 'Failed to delete comment.');
    } finally {
      setCommentLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="page-actions">
        <Link to="/" className="button-link secondary">
          Back to Feed
        </Link>
      </div>
      <h2>{article.title}</h2>
      <p>Status: {article.status}</p>
      <p>Views: {article.views_count}</p>
      <p>{article.content}</p>
      {(role === 'author' || role === 'editor' || role === 'admin') && (
        <Link to={`/editor/${article.article_id}`} className="button-link">
          Edit this article
        </Link>
      )}

      <hr />
      <h3>Comments</h3>
      {canComment && (
        <>
          <label>Add Comment</label>
          <textarea
            rows="4"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Write your comment here"
          />
          <button onClick={submitComment} disabled={commentLoading}>
            Post Comment
          </button>
        </>
      )}
      {commentMessage && <p>{commentMessage}</p>}
      {comments.length === 0 ? (
        <p>No comments yet.</p>
      ) : (
        comments.map((comment) => (
          <div className="card" key={comment.comment_id}>
            <p>
              <strong>{comment.username || `User ${comment.user_id}` || 'Unknown user'}</strong>
              {' '}
              ({comment.role || 'unknown'})
            </p>
            <p>{comment.content}</p>
            <p>{comment.created_at || 'Unknown time'}</p>
            {canDeleteComments && (
              <button
                className="secondary"
                onClick={() => deleteComment(comment.comment_id)}
                disabled={commentLoading}
              >
                Delete Comment
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
