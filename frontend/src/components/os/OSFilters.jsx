import React from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, X, Filter } from "lucide-react";

export default function OSFilters({ filters, setFilters, onClear }) {
  const hasActiveFilters = filters.search || filters.priority !== 'all' || filters.status !== 'all';

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">Filtros</span>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onClear}
            className="text-slate-500 hover:text-slate-700 h-7 px-2">
            <X className="w-3 h-3 mr-1" /> Limpar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Busca */}
        <div className="space-y-1">
          <Label htmlFor="search-filter" className="text-xs font-medium text-slate-600">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              id="search-filter"
              placeholder="Nº OS, cliente ou equipamento..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="pl-9 h-8 text-sm"
            />
          </div>
        </div>

        {/* Prioridade */}
        <div className="space-y-1">
          <Label htmlFor="priority-filter" className="text-xs font-medium text-slate-600">Prioridade</Label>
          <Select value={filters.priority} onValueChange={(v) => setFilters({ ...filters, priority: v })}>
            <SelectTrigger id="priority-filter" className="h-8 text-sm">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Prioridades</SelectItem>
              <SelectItem value="URGENT">Urgente</SelectItem>
              <SelectItem value="HIGH">Alta</SelectItem>
              <SelectItem value="MEDIUM">Média</SelectItem>
              <SelectItem value="LOW">Baixa</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Status */}
        <div className="space-y-1">
          <Label htmlFor="status-filter" className="text-xs font-medium text-slate-600">Status</Label>
          <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
            <SelectTrigger id="status-filter" className="h-8 text-sm">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              <SelectItem value="RECEIVED">Recebido</SelectItem>
              <SelectItem value="ANALYSIS">Em Análise</SelectItem>
              <SelectItem value="MAINTENANCE">Manutenção</SelectItem>
              <SelectItem value="WAITING_PARTS">Aguardando Peças</SelectItem>
              <SelectItem value="READY_FOR_PICKUP">Pronto p/ Retirada</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}