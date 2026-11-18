// Photo helpers shared by "Add a mistake from paper" (Galti) and "Test from paper".

/** Rotate, brighten and shrink a photo in the browser before storing it. */
export async function processPhoto(file: Blob, quarterTurns: number, bright: boolean): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const maxW = 1400
  const turned = quarterTurns % 2 === 1
  const srcW = turned ? bmp.height : bmp.width
  const scale = Math.min(1, maxW / srcW)
  const w = Math.round((turned ? bmp.height : bmp.width) * scale)
  const h = Math.round((turned ? bmp.width : bmp.height) * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  if (bright) ctx.filter = 'brightness(1.25) contrast(1.25) saturate(0.6)'
  ctx.translate(w / 2, h / 2)
  ctx.rotate((quarterTurns * Math.PI) / 2)
  const dw = bmp.width * scale
  const dh = bmp.height * scale
  ctx.drawImage(bmp, -dw / 2, -dh / 2, dw, dh)
  const toBlob = (type: string, q: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, q))
  const webp = await toBlob('image/webp', 0.8)
  return webp && webp.type === 'image/webp' ? webp : ((await toBlob('image/jpeg', 0.82)) as Blob)
}

/** A small, turned preview of a photo (for thumbnails and the corner editor). */
export async function photoPreview(file: Blob, quarterTurns: number, maxSide = 900): Promise<{ url: string; width: number; height: number }> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale)
  const h = Math.round(bmp.height * scale)
  const q = ((quarterTurns % 4) + 4) % 4
  const canvas = document.createElement('canvas')
  canvas.width = q % 2 ? h : w
  canvas.height = q % 2 ? w : h
  const ctx = canvas.getContext('2d')!
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((q * Math.PI) / 2)
  ctx.drawImage(bmp, -w / 2, -h / 2, w, h)
  bmp.close?.()
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.8))
  return { url: URL.createObjectURL(blob!), width: canvas.width, height: canvas.height }
}
