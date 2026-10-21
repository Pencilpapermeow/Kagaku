// Pulls packs from the private content repo (Pencilpapermeow/kagaku-content) with a
// read-only fine-grained token. The repo holds index.json plus one .kagaku file per pack.

import { db } from '../db/db'
import { zContentIndex, type ContentIndex } from './schema'
import { importPack } from './importer'

const API = 'https://api.github.com'

async function getRaw(repo: string, token: string, path: string): Promise<Response> {
  const res = await fetch(`${API}/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
    headers: {
      Accept: 'application/vnd.github.raw+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
  })
  if (res.status === 401) throw new Error('GitHub says the token is wrong or expired. Make a new one in Settings.')
  if (res.status === 404) throw new Error(`Not found: ${repo}/${path}. Check the repo name and that the token can read it.`)
  if (!res.ok) throw new Error(`GitHub error ${res.status}`)
  return res
}

export async function fetchIndex(repo: string, token: string): Promise<ContentIndex> {
  const res = await getRaw(repo, token, 'index.json')
  const parsed = zContentIndex.safeParse(await res.json())
  if (!parsed.success) throw new Error('index.json in the content repo is not valid.')
  return parsed.data
}

export interface RemoteStatus {
  entry: ContentIndex['packs'][number]
  state: 'new' | 'update' | 'installed'
}

export async function compareWithInstalled(index: ContentIndex): Promise<RemoteStatus[]> {
  const installed = await db.packs.bulkGet(index.packs.map((p) => p.id))
  return index.packs.map((entry, i) => ({
    entry,
    state: !installed[i] ? 'new' : installed[i]!.sha256 === entry.sha256 ? 'installed' : 'update',
  }))
}

export async function downloadPack(repo: string, token: string, entry: ContentIndex['packs'][number]) {
  const res = await getRaw(repo, token, entry.file)
  const bytes = new Uint8Array(await res.arrayBuffer())
  return importPack(bytes, 'repo')
}
