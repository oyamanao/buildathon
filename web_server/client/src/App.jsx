import { useState } from 'react';
import LoginScreen from './components/LoginScreen';
import GameScreen from './components/GameScreen';

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('echo_blade_user');
    return saved ? JSON.parse(saved) : null;
  });

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('echo_blade_user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('echo_blade_user');
  };

  return (
    <>
      <div className="app-bg" />
      {user ? (
        <GameScreen user={user} onLogout={handleLogout} />
      ) : (
        <LoginScreen onLogin={handleLogin} />
      )}
    </>
  );
}
