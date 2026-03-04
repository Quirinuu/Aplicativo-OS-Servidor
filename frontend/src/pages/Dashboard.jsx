import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw, Loader2, ZoomIn, ZoomOut, Maximize2, Minimize2 } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import StatsCards from "@/components/os/StatsCards";
import OSFilters from "@/components/os/OSFilters";
import OSCardGrid from "@/components/os/OSCardGrid";
import OSForm from "@/components/os/OSForm";
import api from '@/api/client';

const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const getCustomOrder = () => {
  try {
    const stored = localStorage.getItem('osCustomOrder');
    return stored ? JSON.parse(stored) : {};
  } catch { return {}; }
};
const saveCustomOrder = (m) => localStorage.setItem('osCustomOrder', JSON.stringify(m));

// zoom: +2 = cards grandes (menos colunas) … -2 = cards pequenos (muitas colunas)
const ZOOM_MIN = -2;
const ZOOM_MAX = 2;
const zoomLabel = { '-2': 'Mini', '-1': 'Compacto', '0': 'Padrão', '1': 'Médio', '2': 'Grande' };

export default function Dashboard() {
  const [showForm, setShowForm]             = useState(false);
  const [zoom, setZoom]                     = useState(0);
  const [fullscreen, setFullscreen]         = useState(false);
  const [filters, setFilters]               = useState({ search: '', priority: 'all', status: 'all' });
  const [user, setUser]                     = useState(null);
  const [customOrderMap, setCustomOrderMap] = useState(getCustomOrder());
 

  const queryClient = useQueryClient();

  useEffect(() => {
    api.auth.me().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = () => {
  if (!fullscreen) {
    document.documentElement.requestFullscreen()
      .then(() => setFullscreen(true))
      .catch(() => setFullscreen(true)); // fallback CSS-only (Electron)
  } else {
    setFullscreen(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }
};

  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ['orders', filters],
    queryFn: async () => {
      const f = {};
      if (filters.search)             { f.clientName = filters.search; f.equipmentName = filters.search; }
      if (filters.priority !== 'all') f.priority = filters.priority;
      if (filters.status   !== 'all') f.status   = filters.status;
      return api.serviceOrders.list(f);
    },
  });

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: api.users.list });

  const createMutation = useMutation({
    mutationFn: (data) => api.serviceOrders.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setShowForm(false);
      toast.success('OS criada!');
    },
    onError: (e) => toast.error(e.message || 'Erro ao criar OS'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.serviceOrders.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Prioridade atualizada!');
    },
    onError: (e) => toast.error(e.message || 'Erro ao atualizar'),
  });

  const handleReorder = (newOrder) => {
    const map = {};
    newOrder.forEach((o, i) => { map[o.id] = i; });
    setCustomOrderMap(map);
    saveCustomOrder(map);
  };

  const clearFilters = () => setFilters({ search: '', priority: 'all', status: 'all' });

  const sortedOrders = useMemo(() => {
    const filtered = orders.filter(order => {
      if (order.currentStatus === 'COMPLETED') return false;
      if (filters.search) {
        const s = filters.search.toLowerCase();
        if (!(
          order.osNumber?.toLowerCase().includes(s) ||
          order.clientName?.toLowerCase().includes(s) ||
          order.equipmentName?.toLowerCase().includes(s)
        )) return false;
      }
      if (filters.priority !== 'all' && order.priority !== filters.priority) return false;
      if (filters.status   !== 'all' && order.currentStatus !== filters.status) return false;
      return true;
    });

    const urgent    = filtered.filter(o => o.priority === 'URGENT');
    const nonUrgent = filtered.filter(o => o.priority !== 'URGENT');

    const sortByCustom = (a, b) => {
      const oA = customOrderMap[a.id], oB = customOrderMap[b.id];
      if (oA !== undefined && oB !== undefined) return oA - oB;
      if (oA !== undefined) return -1;
      if (oB !== undefined) return  1;
      return new Date(a.createdAt) - new Date(b.createdAt);
    };

    urgent.sort(sortByCustom);
    nonUrgent.sort((a, b) => {
      const d = priorityOrder[a.priority] - priorityOrder[b.priority];
      return d !== 0 ? d : sortByCustom(a, b);
    });

    return [...urgent, ...nonUrgent];
  }, [orders, filters, customOrderMap]);

  const isAdmin = user?.role === 'admin';

  // ── Zoom controls (reusado em ambos layouts) ─────────────────────────────
  const ZoomControls = () => (
    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
      <button
        onClick={() => setZoom(z => Math.max(ZOOM_MIN, z - 1))}
        disabled={zoom === ZOOM_MIN}
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Cards menores"
      >
        <ZoomOut className="w-4 h-4 text-slate-600" />
      </button>
      <span className="text-xs text-slate-500 w-16 text-center select-none">
        {zoomLabel[String(zoom)]}
      </span>
      <button
        onClick={() => setZoom(z => Math.min(ZOOM_MAX, z + 1))}
        disabled={zoom === ZOOM_MAX}
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Cards maiores"
      >
        <ZoomIn className="w-4 h-4 text-slate-600" />
      </button>
    </div>
  );

  // ── Fullscreen layout ────────────────────────────────────────────────────
  if (fullscreen) {
    return (
      <div
        
        className="fixed inset-0 z-50 bg-slate-900 flex flex-col overflow-hidden"
      >
        {/* Minimal toolbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-white font-semibold text-sm">OS Manager</span>
            <span className="text-slate-400 text-xs">{sortedOrders.length} abertas</span>
          </div>
          <div className="flex items-center gap-2">
            <ZoomControls />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              className="text-slate-300 hover:text-white hover:bg-slate-700"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFullscreen}
              className="text-slate-300 hover:text-white hover:bg-slate-700"
              title="Sair da tela cheia"
            >
              <Minimize2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Cards */}
        <div className="flex-1 overflow-y-auto p-3">
          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            </div>
          ) : sortedOrders.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
              Nenhuma OS aberta
            </div>
          ) : (
            <OSCardGrid
              orders={sortedOrders}
              zoom={zoom}
              onReorder={handleReorder}
              onPriorityChange={(id, p) => updateMutation.mutateAsync({ id, data: { priority: p } })}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Normal layout ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-[1800px] mx-auto p-4 sm:p-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6"
        >
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Ordens de Serviço</h1>
            <p className="text-slate-500 text-sm mt-0.5">{sortedOrders.length} OS abertas</p>
          </div>

          <div className="flex items-center gap-2">
            <ZoomControls />

            <Button variant="outline" onClick={() => refetch()} disabled={isLoading} size="sm">
              <RefreshCw className={`w-4 h-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={toggleFullscreen}
              title="Tela cheia"
            >
              <Maximize2 className="w-4 h-4" />
            </Button>

            {isAdmin && (
              <Button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700" size="sm">
                <Plus className="w-4 h-4 mr-1.5" />
                Nova OS
              </Button>
            )}
          </div>
        </motion.div>

        <StatsCards orders={orders} />

        <OSFilters filters={filters} setFilters={setFilters} onClear={clearFilters} />

        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : sortedOrders.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-center py-20 bg-white rounded-xl border border-slate-200"
          >
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Plus className="w-6 h-6 text-slate-400" />
            </div>
            <h3 className="text-base font-medium text-slate-700 mb-1">Nenhuma OS encontrada</h3>
            <p className="text-sm text-slate-500 mb-4">
              {filters.search || filters.priority !== 'all' || filters.status !== 'all'
                ? 'Tente ajustar os filtros'
                : 'Crie uma nova ordem de serviço para começar'}
            </p>
            {isAdmin && filters.priority === 'all' && filters.status === 'all' && !filters.search && (
              <Button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700" size="sm">
                <Plus className="w-4 h-4 mr-1.5" /> Criar OS
              </Button>
            )}
          </motion.div>
        ) : (
          <OSCardGrid
            orders={sortedOrders}
            zoom={zoom}
            onReorder={handleReorder}
            onPriorityChange={(id, p) => updateMutation.mutateAsync({ id, data: { priority: p } })}
          />
        )}

        <OSForm
          open={showForm}
          onOpenChange={setShowForm}
          onSubmit={(data) => createMutation.mutateAsync(data)}
          users={users}
          isSubmitting={createMutation.isPending}
        />
      </div>
    </div>
  );
}