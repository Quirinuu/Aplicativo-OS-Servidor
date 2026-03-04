import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Settings as SettingsIcon, Save, Globe, Bell, Database,
  Shield, FolderOpen, RefreshCw, CheckCircle2, XCircle, Eye, EyeOff
} from "lucide-react";
import { toast } from "sonner";
import api from '@/api/client';

export default function Settings() {
  // ─── SHOficina config ───
  const [mdbPath, setMdbPath]           = useState('');
  const [mdbPass, setMdbPass]           = useState('');
  const [showPass, setShowPass]         = useState(false);
  const [shoficinaLoading, setShoficinaLoading] = useState(false);
  const [testStatus, setTestStatus]     = useState(null); // null | 'ok' | 'error'
  const [testMsg, setTestMsg]           = useState('');
  const fileInputRef = useRef(null);

  // ─── General settings ───
  const [settings, setSettings] = useState({
    emailNotifications: true,
    osUpdates: true,
    newComments: true,
    autoRefresh: true,
    refreshInterval: 30,
    sessionTimeout: 60,
    requirePasswordChange: false,
    exportFormat: 'CSV',
    includeComments: true,
  });
  const [loading, setLoading] = useState(false);

  // Load current SHOficina config on mount
  useEffect(() => {
    api.settings.getShoficina()
      .then(data => {
        setMdbPath(data.path || '');
        // Password not returned from server for security
      })
      .catch(() => {});
  }, []);

  // ─── File picker (Electron gives full path via file.path) ───
  const handleFilePick = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // In Electron, file.path gives the full OS path
    const fullPath = file.path || file.name;
    setMdbPath(fullPath);
    setTestStatus(null);
  };

  // ─── Test connection ───
  const handleTest = async () => {
    if (!mdbPath) { toast.error('Informe o caminho do arquivo .mdb'); return; }
    setShoficinaLoading(true);
    setTestStatus(null);
    try {
      const result = await api.settings.testShoficina({ path: mdbPath, password: mdbPass });
      setTestStatus('ok');
      setTestMsg(result.message || 'Conexão estabelecida com sucesso!');
      toast.success(result.message || 'Conexão OK!');
    } catch (err) {
      setTestStatus('error');
      setTestMsg(err.message || 'Falha na conexão');
      toast.error(err.message || 'Falha na conexão');
    } finally {
      setShoficinaLoading(false);
    }
  };

  // ─── Save SHOficina config ───
  const handleSaveShoficina = async () => {
    if (!mdbPath) { toast.error('Informe o caminho do arquivo .mdb'); return; }
    setShoficinaLoading(true);
    try {
      const body = { path: mdbPath };
      if (mdbPass) body.password = mdbPass;
      await api.settings.saveShoficina(body);
      toast.success('Configuração do SHOficina salva! Sincronização reiniciada.');
      setTestStatus(null);
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar');
    } finally {
      setShoficinaLoading(false);
    }
  };

  // ─── General save (simulated) ───
  const handleSave = async () => {
    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      toast.success('Configurações salvas com sucesso!');
    } catch {
      toast.error('Erro ao salvar configurações');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto p-4 sm:p-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <SettingsIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Configurações</h1>
              <p className="text-slate-500">Personalize o comportamento do sistema</p>
            </div>
          </div>
          <Button
            onClick={handleSave}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Salvar Configurações
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Coluna principal ── */}
          <div className="lg:col-span-2 space-y-6">

            {/* ── SHOficina ── */}
            <Card className="border-blue-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-700">
                  <Database className="w-5 h-5" />
                  Banco de Dados SHOficina (.mdb)
                </CardTitle>
                <CardDescription>
                  Configure o caminho e a senha do arquivo de dados do SHOficina.
                  Ao salvar, a sincronização será reiniciada automaticamente.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Caminho do arquivo */}
                <div className="space-y-2">
                  <Label htmlFor="mdbPath">Caminho do arquivo .mdb</Label>
                  <div className="flex gap-2">
                    <Input
                      id="mdbPath"
                      value={mdbPath}
                      onChange={(e) => { setMdbPath(e.target.value); setTestStatus(null); }}
                      placeholder="Ex: C:\SHARMAQ\SHOficina\dados.mdb"
                      className="font-mono text-sm flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      title="Selecionar arquivo"
                      className="flex-shrink-0"
                    >
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                    {/* Hidden file input – Electron exposes file.path */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".mdb,.accdb"
                      className="hidden"
                      onChange={handleFilePick}
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    Clique em <FolderOpen className="inline w-3 h-3" /> para navegar até o arquivo, ou cole o caminho completo.
                  </p>
                </div>

                <Separator />

                {/* Senha */}
                <div className="space-y-2">
                  <Label htmlFor="mdbPass">Senha do banco de dados</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="mdbPass"
                        type={showPass ? 'text' : 'password'}
                        value={mdbPass}
                        onChange={(e) => setMdbPass(e.target.value)}
                        placeholder="Senha atual não exibida por segurança"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    Deixe em branco para manter a senha já configurada.
                  </p>
                </div>

                {/* Feedback do teste */}
                {testStatus && (
                  <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                    testStatus === 'ok'
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}>
                    {testStatus === 'ok'
                      ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      : <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    }
                    <span>{testMsg}</span>
                  </div>
                )}

                {/* Botões */}
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <Button
                    variant="outline"
                    onClick={handleTest}
                    disabled={shoficinaLoading || !mdbPath}
                    className="flex-1"
                  >
                    {shoficinaLoading ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Testar Conexão
                  </Button>
                  <Button
                    onClick={handleSaveShoficina}
                    disabled={shoficinaLoading || !mdbPath}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Salvar e Reiniciar Sync
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ── Notificações ── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  Notificações
                </CardTitle>
                <CardDescription>Configure como você deseja receber notificações</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="emailNotifications">Notificações por Email</Label>
                    <p className="text-sm text-slate-500">Receba atualizações por email</p>
                  </div>
                  <Switch
                    id="emailNotifications"
                    checked={settings.emailNotifications}
                    onCheckedChange={(checked) => setSettings({...settings, emailNotifications: checked})}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="osUpdates">Atualizações de OS</Label>
                    <p className="text-sm text-slate-500">Notificar sobre mudanças em OS</p>
                  </div>
                  <Switch
                    id="osUpdates"
                    checked={settings.osUpdates}
                    onCheckedChange={(checked) => setSettings({...settings, osUpdates: checked})}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="newComments">Novos Comentários</Label>
                    <p className="text-sm text-slate-500">Notificar sobre novos comentários</p>
                  </div>
                  <Switch
                    id="newComments"
                    checked={settings.newComments}
                    onCheckedChange={(checked) => setSettings({...settings, newComments: checked})}
                  />
                </div>
              </CardContent>
            </Card>

            {/* ── Sistema ── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Sistema
                </CardTitle>
                <CardDescription>Configurações gerais do sistema</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="autoRefresh">Atualização Automática</Label>
                    <p className="text-sm text-slate-500">Atualizar dados automaticamente</p>
                  </div>
                  <Switch
                    id="autoRefresh"
                    checked={settings.autoRefresh}
                    onCheckedChange={(checked) => setSettings({...settings, autoRefresh: checked})}
                  />
                </div>
                <Separator />
                {settings.autoRefresh && (
                  <div className="space-y-2">
                    <Label htmlFor="refreshInterval">Intervalo de Atualização (segundos)</Label>
                    <div className="flex items-center gap-4">
                      <Input
                        id="refreshInterval"
                        type="number"
                        min="10"
                        max="300"
                        value={settings.refreshInterval}
                        onChange={(e) => setSettings({...settings, refreshInterval: parseInt(e.target.value) || 30})}
                        className="w-32"
                      />
                      <span className="text-sm text-slate-500">10-300 segundos</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Coluna lateral ── */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Segurança
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sessionTimeout">Tempo de Sessão (minutos)</Label>
                  <Input
                    id="sessionTimeout"
                    type="number"
                    min="5"
                    max="480"
                    value={settings.sessionTimeout}
                    onChange={(e) => setSettings({...settings, sessionTimeout: parseInt(e.target.value) || 60})}
                  />
                  <p className="text-xs text-slate-500">Tempo até logout automático</p>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="requirePasswordChange">Exigir Troca de Senha</Label>
                    <p className="text-sm text-slate-500">Forçar troca periódica</p>
                  </div>
                  <Switch
                    id="requirePasswordChange"
                    checked={settings.requirePasswordChange}
                    onCheckedChange={(checked) => setSettings({...settings, requirePasswordChange: checked})}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  Exportação
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="exportFormat">Formato Padrão</Label>
                  <select
                    id="exportFormat"
                    value={settings.exportFormat}
                    onChange={(e) => setSettings({...settings, exportFormat: e.target.value})}
                    className="w-full p-2 border rounded-md text-sm"
                  >
                    <option value="CSV">CSV</option>
                    <option value="Excel">Excel</option>
                    <option value="PDF">PDF</option>
                  </select>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="includeComments">Incluir Comentários</Label>
                    <p className="text-sm text-slate-500">Exportar histórico</p>
                  </div>
                  <Switch
                    id="includeComments"
                    checked={settings.includeComments}
                    onCheckedChange={(checked) => setSettings({...settings, includeComments: checked})}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
