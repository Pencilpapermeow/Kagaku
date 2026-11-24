// An in-memory stand-in for the parts of GitHub's Git Data API that device sync uses,
// installed as `fetch`. It behaves like the real thing where it matters: blobs are
// content-addressed git ids, trees build on base_tree (sha: null deletes, inline
// `content` creates a blob), and a ref update that isn't a fast-forward is refused.

import { createHash } from 'node:crypto'

function gitSha(bytes: Uint8Array): string {
  return createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex')
}
function hashObj(o: unknown): string {
  return createHash('sha1').update(JSON.stringify(o)).update(String(Math.random())).digest('hex')
}

export interface FakeGithub {
  blobs: Map<string, Uint8Array>
  trees: Map<string, Map<string, string>>
  commits: Map<string, { tree: string; parents: string[]; message: string }>
  refs: Map<string, string>
  /** Token without write permission: POST/PATCH answer 403. */
  readOnly: boolean
  requests: string[]
  /** Files on the branch now: path → text (or byte length for binary). */
  files(branch?: string): Map<string, Uint8Array>
  fetch: typeof fetch
}

export function fakeGithub(repo = 'me/content'): FakeGithub {
  const gh: FakeGithub = {
    blobs: new Map(),
    trees: new Map(),
    commits: new Map(),
    refs: new Map(),
    readOnly: false,
    requests: [],
    files(branch = 'kagaku-sync') {
      const out = new Map<string, Uint8Array>()
      const c = gh.refs.get(branch)
      if (!c) return out
      for (const [p, sha] of gh.trees.get(gh.commits.get(c)!.tree)!) out.set(p, gh.blobs.get(sha)!)
      return out
    },
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const method = (init?.method ?? 'GET').toUpperCase()
      const prefix = `/repos/${repo}`
      const path = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : null
      gh.requests.push(`${method} ${path}`)
      const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
      if (path === null) return json(404, { message: 'Not Found' })
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      if (method !== 'GET' && gh.readOnly) return json(403, { message: 'Resource not accessible by personal access token' })
      let m: RegExpMatchArray | null
      if (method === 'GET' && path === '') return json(200, { full_name: repo })
      if (method === 'GET' && (m = path.match(/^\/git\/ref\/heads\/(.+)$/))) {
        const sha = gh.refs.get(m[1])
        return sha ? json(200, { object: { sha } }) : json(404, { message: 'Not Found' })
      }
      if (method === 'GET' && (m = path.match(/^\/git\/commits\/(\w+)$/))) {
        const c = gh.commits.get(m[1])
        return c ? json(200, { sha: m[1], tree: { sha: c.tree } }) : json(404, {})
      }
      if (method === 'GET' && (m = path.match(/^\/git\/trees\/(\w+)$/))) {
        const t = gh.trees.get(m[1])
        if (!t) return json(404, {})
        return json(200, { truncated: false, tree: [...t].map(([p, sha]) => ({ path: p, type: 'blob', mode: '100644', sha })) })
      }
      if (method === 'GET' && (m = path.match(/^\/git\/blobs\/(\w+)$/))) {
        const b = gh.blobs.get(m[1])
        return b ? new Response(b as BodyInit, { status: 200 }) : json(404, {})
      }
      if (method === 'POST' && path === '/git/blobs') {
        const bytes = Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0))
        const sha = gitSha(bytes)
        gh.blobs.set(sha, bytes)
        return json(201, { sha })
      }
      if (method === 'POST' && path === '/git/trees') {
        const t = new Map(body.base_tree ? gh.trees.get(body.base_tree) : [])
        for (const e of body.tree as { path: string; sha?: string | null; content?: string }[]) {
          if (e.content !== undefined) {
            const bytes = new TextEncoder().encode(e.content)
            const sha = gitSha(bytes)
            gh.blobs.set(sha, bytes)
            t.set(e.path, sha)
          } else if (e.sha === null) {
            if (!t.has(e.path)) return json(422, { message: 'path not in tree' })
            t.delete(e.path)
          } else {
            if (!gh.blobs.has(e.sha!)) return json(422, { message: 'no such blob' })
            t.set(e.path, e.sha!)
          }
        }
        const sha = hashObj([...t])
        gh.trees.set(sha, t)
        return json(201, { sha })
      }
      if (method === 'POST' && path === '/git/commits') {
        const sha = hashObj(body)
        gh.commits.set(sha, { tree: body.tree, parents: body.parents, message: body.message })
        return json(201, { sha })
      }
      if (method === 'PATCH' && (m = path.match(/^\/git\/refs\/heads\/(.+)$/))) {
        const cur = gh.refs.get(m[1])
        if (!cur) return json(422, { message: 'Reference does not exist' })
        if (!body.force && !gh.commits.get(body.sha)?.parents.includes(cur)) return json(422, { message: 'Update is not a fast forward' })
        gh.refs.set(m[1], body.sha)
        return json(200, { object: { sha: body.sha } })
      }
      if (method === 'POST' && path === '/git/refs') {
        const name = String(body.ref).replace(/^refs\/heads\//, '')
        if (gh.refs.has(name)) return json(422, { message: 'Reference already exists' })
        gh.refs.set(name, body.sha)
        return json(201, { ref: body.ref })
      }
      return json(404, { message: `fake: ${method} ${path}` })
    }) as typeof fetch,
  }
  return gh
}
