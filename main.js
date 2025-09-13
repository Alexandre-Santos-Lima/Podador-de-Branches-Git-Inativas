// ---
// Projeto: Podador de Branches Git Inativas (Git Stale Branch Pruner)
// Descrição: Uma ferramenta de linha de comando para encontrar e opcionalmente deletar
//            branches Git locais que já foram mescladas na branch principal (main/master)
//            e cujo rastreamento remoto (remote tracking branch) já foi removido.
//            É útil para limpar seu repositório local de branches antigas.
//
// Bibliotecas necessárias: Nenhuma. Usa apenas os módulos nativos do Node.js.
//                          Requer que o 'git' esteja instalado e acessível no PATH do sistema.
//
// Como executar:
// 1. Para listar as branches que seriam removidas (modo seguro):
//    node main.js
//
// 2. Para DELETAR as branches encontradas (será pedida uma confirmação):
//    node main.js --delete
// ---

const { exec } = require('child_process');
const readline = require('readline');
const util = require('util');

// Promisify 'exec' para usar com async/await, uma prática moderna e limpa.
const execPromise = util.promisify(exec);

// Constantes para cores no console, para uma melhor UX.
const COLORS = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
};

/**
 * Executa um comando no shell e retorna o stdout.
 * @param {string} command - O comando a ser executado.
 * @returns {Promise<string>} - O resultado (stdout) do comando.
 */
async function runCommand(command) {
    try {
        const { stdout } = await execPromise(command);
        return stdout.trim();
    } catch (error) {
        console.error(`${COLORS.red}Erro ao executar o comando: ${command}${COLORS.reset}`);
        console.error(error.stderr);
        // Lança o erro para ser capturado no bloco principal e encerrar a execução.
        throw new Error(`Falha ao executar comando Git. Você está em um repositório Git?`);
    }
}

/**
 * Obtém a branch principal do repositório (geralmente 'main' ou 'master').
 * @returns {Promise<string>} - O nome da branch principal.
 */
async function getMainBranch() {
    try {
        // Tenta obter a branch padrão a partir da configuração do Git
        const defaultBranch = await runCommand('git config --get init.defaultBranch');
        if (defaultBranch) return defaultBranch;
    } catch (e) {
        // Ignora o erro se a configuração não existir e tenta os nomes comuns
    }

    const allBranches = await runCommand('git branch');
    if (allBranches.includes(' main')) {
        return 'main';
    }
    return 'master';
}

/**
 * Função principal que orquestra a limpeza das branches.
 */
async function pruneStaleBranches() {
    console.log(`${COLORS.cyan}--- Iniciando Verificação de Branches Git Inativas ---${COLORS.reset}`);

    try {
        // 1. Sincroniza com o repositório remoto para garantir que temos os dados mais recentes.
        console.log('Sincronizando com o repositório remoto (git fetch --prune)...');
        await runCommand('git fetch --prune');
        
        const mainBranch = await getMainBranch();
        console.log(`Branch principal detectada: ${COLORS.yellow}${mainBranch}${COLORS.reset}`);

        // 2. Obtém a lista de branches que já foram mescladas na branch principal.
        const mergedBranchesOutput = await runCommand(`git branch --merged ${mainBranch}`);
        const localMergedBranches = mergedBranchesOutput
            .split('\n')
            .map(b => b.trim())
            .filter(b => b && !b.startsWith('*') && b !== mainBranch && b !== 'master');

        // 3. Obtém a lista de branches que ainda existem no remoto.
        const remoteBranchesOutput = await runCommand('git branch -r');
        const remoteBranches = remoteBranchesOutput
            .split('\n')
            .map(b => b.trim().replace('origin/', ''))
            .filter(Boolean);

        // 4. Identifica as branches "inativas": mescladas localmente E sem correspondente remoto.
        const staleBranches = localMergedBranches.filter(localBranch => !remoteBranches.includes(localBranch));

        if (staleBranches.length === 0) {
            console.log(`${COLORS.green}Excelente! Nenhuma branch inativa encontrada.${COLORS.reset}`);
            return;
        }

        console.log(`\n${COLORS.yellow}Foram encontradas ${staleBranches.length} branches inativas (mescladas e sem remoto):${COLORS.reset}`);
        staleBranches.forEach(branch => console.log(`  - ${branch}`));

        // 5. Verifica se o script foi executado com o argumento --delete.
        const shouldDelete = process.argv.includes('--delete');

        if (!shouldDelete) {
            console.log(`\n${COLORS.cyan}Modo de simulação. Para deletar, execute novamente com a flag --delete.${COLORS.reset}`);
            console.log(`${COLORS.cyan}Exemplo: node main.js --delete${COLORS.reset}`);
            return;
        }

        // 6. Pede confirmação para a exclusão.
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question(`\n${COLORS.red}Você tem certeza que deseja deletar estas ${staleBranches.length} branches? (s/N) ${COLORS.reset}`, async (answer) => {
            if (answer.toLowerCase() === 's' || answer.toLowerCase() === 'y') {
                console.log('Deletando branches...');
                for (const branch of staleBranches) {
                    try {
                        await runCommand(`git branch -d ${branch}`);
                        console.log(`${COLORS.green}  ✓ Deletada:${COLORS.reset} ${branch}`);
                    } catch (error) {
                        console.error(`${COLORS.red}  ✗ Falha ao deletar:${COLORS.reset} ${branch}`);
                    }
                }
                console.log(`\n${COLORS.green}Limpeza concluída!${COLORS.reset}`);
            } else {
                console.log('Operação cancelada.');
            }
            rl.close();
        });

    } catch (error) {
        console.error(`\n${COLORS.red}ERRO: ${error.message}${COLORS.reset}`);
        process.exit(1);
    }
}

// Executa a função principal.
pruneStaleBranches();
