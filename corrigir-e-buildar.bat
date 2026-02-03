# Script de Correção - OS Manager
# Execute estes comandos na ordem para corrigir o problema

# ============================================
# PASSO 1: Backup dos arquivos atuais
# ============================================
echo "Fazendo backup dos package.json..."
copy package.json package.json.backup
copy backend\package.json backend\package.json.backup

# ============================================
# PASSO 2: Substituir package.json do backend
# ============================================
echo "Substituindo package.json do backend..."
# Cole o conteúdo de backend-package-CORRIGIDO.json em backend\package.json

# ============================================
# PASSO 3: Substituir package.json principal
# ============================================
echo "Substituindo package.json principal..."
# Cole o conteúdo de main-package-CORRIGIDO.json em package.json

# ============================================
# PASSO 4: Limpar e reinstalar dependências do backend
# ============================================
echo "Limpando backend..."
cd backend
rmdir /s /q node_modules
del package-lock.json
echo "Reinstalando dependências do backend..."
npm install
echo "Gerando Prisma Client..."
npx prisma generate
cd ..

# ============================================
# PASSO 5: Limpar builds anteriores
# ============================================
echo "Limpando builds anteriores..."
rmdir /s /q dist

# ============================================
# PASSO 6: Verificar se tudo está OK
# ============================================
echo "Verificando dependências..."
cd backend
npm list cors
npm list @prisma/client
npm list prisma
cd ..

# ============================================
# PASSO 7: Buildar o projeto
# ============================================
echo "Buildando o projeto..."
npm run dist

echo "Processo concluído!"
echo "O instalador estará em: dist\OS Manager Setup x.x.x.exe"
