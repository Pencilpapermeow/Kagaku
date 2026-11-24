// A tiny client for GitHub's Git Data API, used by device sync. Everything lives on one
// branch (`kagaku-sync`) of his private content repo, so the packs on `main` are never
// touched and Claude's clones of the repo (one branch, shallow) don't download it.
//
// One sync = read the branch's tree (3 requests), download only changed files, then at
// most one commit: binary files become blobs, text files go inline into chained tree
// requests, one commit, one ref update. The ref update refuses to go backwards, so two
// devices syncing at the same moment can't overwrite each other (the loser retries).

export const SYNC_BRANCH = 'kagaku-sync'
const API = 'https://api.github.com'

export class SyncConflict extends Error {
  constructor() {
    super('The other device synced at the same moment')
  }
}

export class SyncAuthError extends Error {}

export interface RemoteTree {
  /** null: the branch doesn't exist yet (first sync ever). */
  commit: string | null
  tree: string | null
  /** path → git blob sha */
  files: Map<string, string>
}

export interface FileChange {
  path: string
  /** null deletes the file. */
  data: Uint8Array | string | null
}

export interface RemoteStore {
  read(): Promise<RemoteTree>
  get(sha: string): Promise<Uint8Array>
  commit(base: RemoteTree, changes: FileChange[], message: string): Promise<string>
}

function b64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Text that goes inline into one tree request; bigger batches are split into chained trees. */
const INLINE_BATCH = 900_000

const README = `# Kagaku device sync

This branch is written by the Kagaku app. It carries handwritten cards, typed notes,
papers from "Test from paper" (with their pictures) and packs added by paste or file,
so that every device of his sees them. Please don't edit it by hand.
`

export function githubStore(repo: string, token: string, branch = SYNC_BRANCH): RemoteStore {
  async function gh(method: string, path: string, body?: unknown, accept = 'application/vnd.github+json'): Promise<Response> {
    let res: Response
    try {
      res = await fetch(`${API}/repos/${repo}${path}`, {
        method,
        headers: {
          Accept: accept,
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      })
    } catch {
      throw new Error('No internet — sync will try again later.')
    }
    if (res.status === 401) throw new SyncAuthError('GitHub says the token is wrong or expired. Make a new one in Settings.')
    if (res.status === 403 && method !== 'GET') {
      const text = await res.text()
      if (/rate limit|abuse|secondary/i.test(text)) throw new Error('GitHub asked to slow down. Sync will try again in a few minutes.')
      throw new SyncAuthError('The token can read but not write. On GitHub, give it "Contents: Read and write" for this repo.')
    }
    return res
  }
  async function json<T>(res: Response, what: string): Promise<T> {
    if (!res.ok) throw new Error(`GitHub error ${res.status} (${what})`)
    return (await res.json()) as T
  }

  return {
    async read() {
      const ref = await gh('GET', `/git/ref/heads/${branch}`)
      if (ref.status === 404 || ref.status === 409) {
        // No branch yet. Make sure the repo itself is reachable, so a wrong name isn't mistaken for "first sync".
        const r = await gh('GET', '')
        if (!r.ok) throw new SyncAuthError(`Repo ${repo} not found, or the token can't see it.`)
        return { commit: null, tree: null, files: new Map() }
      }
      const { object } = await json<{ object: { sha: string } }>(ref, 'branch')
      const commit = await json<{ tree: { sha: string } }>(await gh('GET', `/git/commits/${object.sha}`), 'commit')
      const tree = await json<{ truncated: boolean; tree: { path: string; type: string; sha: string }[] }>(await gh('GET', `/git/trees/${commit.tree.sha}?recursive=1`), 'tree')
      if (tree.truncated) throw new Error('The sync branch has too many files for one read.')
      const files = new Map<string, string>()
      for (const e of tree.tree) if (e.type === 'blob') files.set(e.path, e.sha)
      return { commit: object.sha, tree: commit.tree.sha, files }
    },

    async get(sha) {
      const res = await gh('GET', `/git/blobs/${sha}`, undefined, 'application/vnd.github.raw+json')
      if (!res.ok) throw new Error(`GitHub error ${res.status} (file)`)
      return new Uint8Array(await res.arrayBuffer())
    },

    async commit(base, changes, message) {
      type Entry = { path: string; mode: '100644'; type: 'blob'; sha?: string | null; content?: string }
      const entries: Entry[] = []
      for (const c of changes) {
        if (c.data === null) {
          // Deleting a path the tree doesn't have is an error on GitHub.
          if (base.files.has(c.path)) entries.push({ path: c.path, mode: '100644', type: 'blob', sha: null })
        } else if (typeof c.data === 'string') {
          entries.push({ path: c.path, mode: '100644', type: 'blob', content: c.data })
        } else {
          const blob = await json<{ sha: string }>(await gh('POST', '/git/blobs', { content: b64(c.data), encoding: 'base64' }), 'upload')
          entries.push({ path: c.path, mode: '100644', type: 'blob', sha: blob.sha })
        }
      }
      if (!base.commit && !base.files.has('README.md')) entries.push({ path: 'README.md', mode: '100644', type: 'blob', content: README })
      // Chained trees, each with at most INLINE_BATCH characters of inline text.
      let tree = base.tree
      let batch: Entry[] = []
      let size = 0
      const flushBatch = async () => {
        if (!batch.length) return
        const res = await gh('POST', '/git/trees', tree ? { base_tree: tree, tree: batch } : { tree: batch })
        tree = (await json<{ sha: string }>(res, 'tree')).sha
        batch = []
        size = 0
      }
      for (const e of entries) {
        const n = e.content?.length ?? 100
        if (size + n > INLINE_BATCH) await flushBatch()
        batch.push(e)
        size += n
      }
      await flushBatch()
      if (!tree) throw new Error('Nothing to commit')
      const commit = await json<{ sha: string }>(await gh('POST', '/git/commits', { message, tree, parents: base.commit ? [base.commit] : [] }), 'commit')
      const ref = base.commit
        ? await gh('PATCH', `/git/refs/heads/${branch}`, { sha: commit.sha, force: false })
        : await gh('POST', '/git/refs', { ref: `refs/heads/${branch}`, sha: commit.sha })
      if (ref.status === 422 || ref.status === 409) throw new SyncConflict()
      if (!ref.ok) throw new Error(`GitHub error ${ref.status} (branch)`)
      return commit.sha
    },
  }
}

/** The sha GitHub gives a file with these bytes (git blob id), so unchanged files aren't re-sent. */
export async function gitBlobSha(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const head = new TextEncoder().encode(`blob ${bytes.byteLength}\0`)
  const all = new Uint8Array(head.length + bytes.byteLength)
  all.set(head)
  all.set(bytes, head.length)
  const digest = await crypto.subtle.digest('SHA-1', all)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
