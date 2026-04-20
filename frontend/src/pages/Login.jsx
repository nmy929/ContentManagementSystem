import React, { useState } from 'react';
import api from '../api';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.post('/api/auth/login', { username, password });
      onLogin(res.data.token, res.data.role, res.data.user_id);
    } catch (err) {
      setError('Login failed.');
    }
  };

  return (
    <div className="card">
      <h2>Login</h2>
      {/* <p>Use usernames from the dataset: author1, editor1, admin1.</p> */}
      <form onSubmit={submit}>
        <label>Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit">Sign in</button>
        {error && <p>{error}</p>}
      </form>
    </div>
  );
}
