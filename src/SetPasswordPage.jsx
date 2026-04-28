import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';

export default function SetPasswordPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => navigate('/'), 1500);
    return () => clearTimeout(id);
  }, [done, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Пароль должен быть не менее 8 символов.');
      return;
    }
    setSubmitting(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateErr) {
      setError('Не удалось сохранить пароль. Ссылка могла истечь — запросите новую через «Забыли пароль?» на странице входа.');
      return;
    }
    setDone(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold">Задайте пароль</h1>
        {done ? (
          <p className="text-sm text-muted-foreground">Готово. Перенаправляем…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">Пароль</label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
            </div>
            {error && <p role="alert" className="text-sm text-[var(--danger-ink)]">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
