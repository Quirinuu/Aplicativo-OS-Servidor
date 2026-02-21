// frontend/src/App.jsx  ← APP SERVIDOR
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Toaster } from 'sonner';

import Dashboard from './pages/Dashboard';
import History from './pages/History';
import OSDetails from './pages/OSDetails';
import Users from './pages/Users';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Layout from './Layout';
import Login from './pages/Login';
import { socketService } from './api/socket';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30 * 1000,
    },
  },
});

function ProtectedRoute({ children, requireAdmin = false }) {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (!token) return <Navigate to="/login" replace />;
  if (requireAdmin && user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return children;
}

// Gerencia o socket e invalida o cache do React Query em tempo real.
// NÃO desconecta no cleanup — socket persiste durante toda a sessão.
function SocketManager() {
  const qc = useQueryClient();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    socketService.connect(token); // no-op se já estiver conectado

    const onCreated = () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['history'] });
    };

    const onUpdated = ({ order }) => {
      if (order?.id) qc.setQueryData(['order', String(order.id)], order);
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['history'] });
    };

    const onDeleted = () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['history'] });
    };

    const onComment = ({ osId }) => {
      if (osId) qc.invalidateQueries({ queryKey: ['order', String(osId)] });
    };

    socketService.on('os:created', onCreated);
    socketService.on('os:updated', onUpdated);
    socketService.on('os:deleted', onDeleted);
    socketService.on('os:comment', onComment);

    return () => {
      // Remove só os listeners deste efeito. NÃO chama disconnect().
      socketService.off('os:created', onCreated);
      socketService.off('os:updated', onUpdated);
      socketService.off('os:deleted', onDeleted);
      socketService.off('os:comment', onComment);
    };
  }, [qc]);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <Toaster richColors position="top-right" />
        <SocketManager />
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Layout currentPageName="Dashboard"><Dashboard /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/history" element={
            <ProtectedRoute>
              <Layout currentPageName="Histórico"><History /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/os/:id" element={
            <ProtectedRoute>
              <Layout currentPageName="Detalhes da OS"><OSDetails /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/users" element={
            <ProtectedRoute requireAdmin>
              <Layout currentPageName="Usuários"><Users /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/profile" element={
            <ProtectedRoute>
              <Layout currentPageName="Meu Perfil"><Profile /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/settings" element={
            <ProtectedRoute requireAdmin>
              <Layout currentPageName="Configurações"><Settings /></Layout>
            </ProtectedRoute>
          } />

          <Route index element={<Navigate to="/dashboard" replace />} />

          <Route path="*" element={
            <div className="min-h-screen flex items-center justify-center">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-slate-800 mb-2">404 — Página não encontrada</h1>
                <a href="/dashboard" className="text-blue-600 hover:text-blue-800">Voltar ao Dashboard</a>
              </div>
            </div>
          } />
        </Routes>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

export default App;