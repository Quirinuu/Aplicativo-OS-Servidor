; ============================================
; OS Manager SERVIDOR - Custom NSIS Installer Script
; ============================================
; Instala o Node.js 20.18.1 se necessário,
; depois instala o backend (SQLite + Express).
; ============================================

!include "MUI2.nsh"

; ============================================
; Macro auxiliar: checar versão do Node.js
; ============================================
; Retorna na variável $1 a versão encontrada, ou vazio se não instalado.
!macro CheckNodeVersion
  ClearErrors
  nsExec::ExecToStack 'node.exe --version'
  Pop $0  ; exit code
  Pop $1  ; stdout (ex: "v20.18.1")
  IfErrors NoNode 0
  StrCmp $0 "0" HasNode NoNode
  HasNode:
    ; $1 tem a versão. Nada a fazer.
    Goto NodeCheckDone
  NoNode:
    StrCpy $1 ""
  NodeCheckDone:
!macroend

; ============================================
; Verificação de instalação existente
; ============================================
!macro customInit
  ReadRegStr $0 HKCU "Software\${PRODUCT_NAME}" "InstallLocation"
  StrCmp $0 "" NotInstalled

  MessageBox MB_YESNO|MB_ICONQUESTION \
    "${PRODUCT_NAME} já está instalado em:$\n$0$\n$\nDeseja desinstalar a versão anterior primeiro?" \
    IDYES Uninstall IDNO Continue

  Uninstall:
    ExecWait '"$0\Uninstall ${PRODUCT_NAME}.exe" /S _?=$0'
    Delete "$0\Uninstall ${PRODUCT_NAME}.exe"
    RMDir "$0"

  Continue:
  NotInstalled:
!macroend

; ============================================
; Customização da Instalação
; ============================================
!macro customInstall
  DetailPrint "Verificando Node.js..."

  ; --- Checar se Node.js 20.x está instalado ---
  !insertmacro CheckNodeVersion

  ; $1 terá algo como "v20.18.1" ou estará vazio
  StrCmp $1 "" InstallNode 0

  ; Checar se é versão 20.x (começa com "v20.")
  StrCpy $2 $1 4   ; pega os 4 primeiros chars: "v20."
  StrCmp $2 "v20." NodeOk 0

  ; Versão diferente de 20.x encontrada — instalar mesmo assim
  DetailPrint "Node.js encontrado ($1), mas não é v20.x. Instalando v20.18.1..."
  Goto InstallNode

  NodeOk:
    DetailPrint "Node.js $1 encontrado. Pulando instalação."
    Goto NodeDone

  InstallNode:
    DetailPrint "Instalando Node.js 20.18.1..."
    
    ; O arquivo node-installer.msi foi copiado para resources pelo extraResources
    StrCpy $3 "$INSTDIR\resources\node-installer.msi"
    
    IfFileExists "$3" DoInstallNode 0
      ; Fallback: tentar na mesma pasta do instalador
      StrCpy $3 "$EXEDIR\node-installer.msi"
    
    IfFileExists "$3" DoInstallNode NodeInstallerNotFound
    
    DoInstallNode:
      DetailPrint "Executando instalador do Node.js (silencioso)..."
      ; /quiet = instalação silenciosa; /norestart = não reiniciar automaticamente
      ExecWait 'msiexec.exe /i "$3" /quiet /norestart ADDLOCAL=ALL' $4
      
      IntCmp $4 0 NodeInstalled 0 0
      NodeInstalled:
        DetailPrint "Node.js 20.18.1 instalado com sucesso!"
        Goto NodeDone
      
      ; Se não retornou 0, pode ser erro ou reboot pendente (3010)
      IntCmp $4 3010 NodeInstalledReboot 0 0
      NodeInstalledReboot:
        DetailPrint "Node.js instalado — reinicialização necessária após conclusão."
        Goto NodeDone
      
      ; Outro código de saída = erro
      DetailPrint "Aviso: instalador do Node.js retornou código $4"
      MessageBox MB_OK|MB_ICONEXCLAMATION \
        "O instalador do Node.js retornou código $4.$\n$\nSe o OS Manager Servidor não iniciar, instale manualmente o Node.js 20.x de nodejs.org"
      Goto NodeDone

    NodeInstallerNotFound:
      DetailPrint "ERRO: Arquivo do instalador Node.js não encontrado!"
      MessageBox MB_OK|MB_ICONEXCLAMATION \
        "Instalador do Node.js não encontrado em:$\n$3$\n$\nInstale manualmente o Node.js 20.x de nodejs.org antes de usar o OS Manager Servidor."

  NodeDone:

  ; --- Instalar backend ---
  DetailPrint "Instalando backend..."

  CreateDirectory "$INSTDIR\resources\app.asar.unpacked\backend"
  SetOutPath "$INSTDIR\resources\app.asar.unpacked\backend"

  ; Copiar tudo do backend exceto cache e logs
  File /r /x ".cache" /x ".vite" /x "*.log" "${BUILD_RESOURCES_DIR}\..\backend\*.*"

  ; Verificar se node_modules foi copiado
  IfFileExists "$INSTDIR\resources\app.asar.unpacked\backend\node_modules\*.*" BackendOk 0
    DetailPrint "AVISO: node_modules pode não ter sido copiado completamente."
    MessageBox MB_OK|MB_ICONEXCLAMATION \
      "Instalação concluída com avisos.$\nSe o servidor não iniciar, entre em contato com o suporte."
  BackendOk:

  DetailPrint "Backend instalado com sucesso!"
  DetailPrint ""
  DetailPrint "=== OS Manager Servidor pronto! ==="
  DetailPrint "O IP do servidor aparecerá na tela ao abrir o aplicativo."
!macroend

; ============================================
; Customização da Desinstalação
; ============================================
!macro customUnInstall
  DetailPrint "Removendo backend..."
  RMDir /r "$INSTDIR\resources\app.asar.unpacked\backend"

  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Deseja remover também o banco de dados e configurações?$\n$\nPasta: $APPDATA\os-manager-desktop$\n$\nATENÇÃO: isso apagará todas as Ordens de Serviço!" \
    IDYES RemoveAppData IDNO SkipAppData

  RemoveAppData:
    RMDir /r "$APPDATA\os-manager-desktop"
    DetailPrint "Dados do aplicativo removidos."
    Goto Done

  SkipAppData:
    DetailPrint "Dados do aplicativo mantidos em $APPDATA\os-manager-desktop"

  Done:
  DetailPrint "Desinstalação concluída."
  
  ; Nota: NÃO desinstalar o Node.js — pode ser usado por outros programas.
!macroend
