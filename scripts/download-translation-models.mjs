import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const modelsRoot = path.join(projectRoot, 'public/translation/models')
const manifest = JSON.parse(await readFile(new URL('../src/translation/models.json', import.meta.url), 'utf8'))
const args = process.argv.slice(2)
const verifyOnly = args.includes('--verify')
let requestedModel
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index]
  if (argument === '--verify') continue
  if (argument === '--help') {
    console.log('Uso: node scripts/download-translation-models.mjs [--verify] [--model en-pt|pt-en]')
    console.log('Sem opções: baixa apenas arquivos ausentes ou inválidos das revisões fixadas.')
    console.log('--verify: verifica tamanhos e SHA-256 locais, sem acessar a rede ou alterar arquivos.')
    process.exit(0)
  }
  if (argument === '--model' && args[index + 1]) {
    requestedModel = args[++index]
    continue
  }
  throw new Error(`Opção inválida: ${argument}. Use --help.`)
}
const models = requestedModel ? manifest.filter((model) => model.id === requestedModel) : manifest
if (models.length === 0) throw new Error(`Modelo desconhecido: ${requestedModel}`)

function resolveAsset(modelId, relativePath) {
  if (!/^(en-pt|pt-en)$/.test(modelId)) throw new Error(`Alias de modelo inválido: ${modelId}`)
  const directory = path.resolve(modelsRoot, modelId)
  const target = path.resolve(directory, relativePath)
  if (!target.startsWith(`${directory}${path.sep}`)) throw new Error(`Caminho inválido: ${relativePath}`)
  return target
}

async function isValid(target, file) {
  try {
    if ((await stat(target)).size !== file.bytes) return false
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(target)) hash.update(chunk)
    return hash.digest('hex') === file.sha256
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

async function download(model, file, target) {
  await mkdir(path.dirname(target), { recursive: true })
  const temporary = `${target}.download`
  const source = file.sourceUrl ?? `https://huggingface.co/${model.upstream}/resolve/${model.revision}/${file.path}`
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      if (typeof file.content === 'string') {
        await writeFile(temporary, file.content)
      } else {
        const response = await fetch(source, { signal: AbortSignal.timeout(180_000) })
        if (!response.ok) throw new Error(`HTTP ${response.status} em ${source}`)
        if (!response.body) throw new Error(`Resposta vazia em ${source}`)
        await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary))
      }
      if (!(await isValid(temporary, file))) throw new Error(`Tamanho ou SHA-256 divergente: ${model.id}/${file.path}`)
      await rename(temporary, target)
      return
    } catch (error) {
      await rm(temporary, { force: true })
      if (attempt === 3) throw error
      console.warn(`Tentativa ${attempt}/3 falhou: ${model.id}/${file.path}: ${error.message}`)
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000))
    }
  }
}

let invalidCount = 0
let verifiedBytes = 0
for (const model of models) {
  for (const file of [...model.files, ...model.notices]) {
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      throw new Error(`Metadados inválidos: ${model.id}/${file.path}`)
    }
    const target = resolveAsset(model.id, file.path)
    if (!(await isValid(target, file))) {
      if (verifyOnly) {
        invalidCount += 1
        console.error(`Ausente ou inválido: ${model.id}/${file.path}`)
        continue
      }
      await download(model, file, target)
      console.log(`Baixado e validado: ${model.id}/${file.path} (${file.bytes} bytes)`)
    }
    verifiedBytes += file.bytes
  }
  console.log(`${model.id}: verificação concluída`)
}
if (invalidCount > 0) {
  console.error(`${invalidCount} arquivo(s) ausente(s) ou inválido(s).`)
  process.exitCode = 1
} else {
  console.log(`Modelos e avisos íntegros: ${verifiedBytes} bytes; SHA-256 conferidos.`)
}
