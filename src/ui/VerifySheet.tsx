import { useEffect, useState } from 'react'
import { CheckCircle2, CircleHelp, Search, Send, Sparkles, Wrench } from 'lucide-react'
import { db } from '../db/db'
import { useSettings } from '../db/settings'
import type { Question } from '../content/schema'
import { check, type Response } from '../engine/marking'
import { askGemini, fixKey, googleSearchUrl, responseToAnswer, setKeyStatus, shareForVerify } from '../engine/verify'
import { AnswerInput } from './answer'
import { Rich } from './content'
import { Button, Sheet, toast } from './kit'

/**
 * Verify a question's key. `shown` is the question as he saw it (options may be re-lettered);
 * fixes are made on the original stored question so the correction survives every variant.
 */
export function VerifySheet({ open, onClose, shown, response, onFixed }: { open: boolean; onClose: () => void; shown: Question; response?: Response; onFixed?: (nowCorrect: boolean) => void }) {
  const settings = useSettings()
  const [gemini, setGemini] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [fixing, setFixing] = useState(false)
  const [original, setOriginal] = useState<Question>()
  const [fixValue, setFixValue] = useState<Response>()

  useEffect(() => {
    if (!open) return
    setGemini(undefined)
    setFixing(false)
    setFixValue(undefined)
    db.questions.get(shown.id).then(async (q) => setOriginal(q ?? (await db.galti.get(shown.id))?.snapshot ?? shown))
  }, [open, shown])

  const share = async () => {
    const how = await shareForVerify(shown, response)
    if (how === 'copied') toast('Prompt copied — paste it into the Claude app')
  }
  const ask = async () => {
    setBusy(true)
    try {
      setGemini(await askGemini(settings.geminiKey, settings.geminiModel, shown, response))
    } catch (e) {
      setGemini(`⚠️ ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  const confirm = async () => {
    await setKeyStatus(shown.id, 'confirmed')
    toast('Marked: key was right')
    onClose()
  }
  const doubtful = async () => {
    await setKeyStatus(shown.id, 'doubtful')
    toast('Added to the Doubtful list')
    onClose()
  }
  const saveFix = async () => {
    if (!original || !fixValue) return
    const answer = responseToAnswer(original, fixValue)
    if (answer === undefined) return
    await fixKey(original, answer)
    // Was his answer actually right? Compare on the original question's ids when possible.
    const sameOptions = JSON.stringify((original as { options?: unknown }).options) === JSON.stringify((shown as { options?: unknown }).options)
    const nowCorrect = !!response && sameOptions && check({ ...original, answer } as Question, response).correct
    if (nowCorrect) {
      const g = await db.galti.get(shown.id)
      if (g && g.wrongCount <= 1) await db.galti.delete(shown.id)
    }
    toast('Key fixed for good')
    onFixed?.(nowCorrect)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Verify this question">
      {!fixing ? (
        <div className="verify">
          <p className="muted small">Check the key with someone smart, then tell Kagaku what you found. (Needs internet.)</p>
          <div className="verify-actions">
            <Button variant="primary" icon={<Send size={18} />} onClick={share} block>
              Ask Claude (share)
            </Button>
            <a className="btn btn-soft btn-md btn-block" href={googleSearchUrl(shown)} target="_blank" rel="noreferrer">
              <Search size={18} />
              <span>Search Google / Lens</span>
            </a>
            {settings.geminiKey ? (
              <Button icon={<Sparkles size={18} />} onClick={ask} disabled={busy} block>
                {busy ? 'Asking Gemini…' : 'Ask Gemini here'}
              </Button>
            ) : (
              <p className="muted small">Add a Gemini key in Settings to ask inside the app.</p>
            )}
          </div>
          {gemini && (
            <div className="card gemini-answer">
              <Rich text={gemini} />
            </div>
          )}
          <h3 className="section-title small">What did you find?</h3>
          <div className="verify-outcomes">
            <Button variant="good" icon={<CheckCircle2 size={18} />} onClick={confirm}>
              Key was right
            </Button>
            <Button variant="danger" icon={<Wrench size={18} />} onClick={() => setFixing(true)}>
              Key was wrong → fix
            </Button>
            <Button icon={<CircleHelp size={18} />} onClick={doubtful}>
              Still doubtful
            </Button>
          </div>
        </div>
      ) : (
        original && (
          <div className="verify">
            <p>Choose the correct answer. Options are in their original order here.</p>
            <AnswerInput q={original} value={fixValue} onChange={setFixValue} variant="cbt" />
            <div className="row gap">
              <Button variant="primary" onClick={saveFix} disabled={!fixValue}>
                Save correct answer
              </Button>
              <Button variant="ghost" onClick={() => setFixing(false)}>
                Back
              </Button>
            </div>
          </div>
        )
      )}
    </Sheet>
  )
}
