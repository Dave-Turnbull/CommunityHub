export type InlineToken =
    | { type: 'text'; value: string }
    | { type: 'link'; href: string }
    | { type: 'code'; value: string }
    | { type: 'bold' | 'italic' | 'strike'; children: InlineToken[] }

export type BlockToken =
    | InlineToken
    | { type: 'codeBlock'; value: string }
    | { type: 'quote'; children: InlineToken[] }

export type MessageToken = BlockToken

// Bounds the token tree's depth (and so the renderer's recursion) on hostile
// input; an opener past this depth is left as literal text.
const MAX_NESTING = 8

const URL_START = /^https?:\/\//i
const FENCE_OPEN = /^```[A-Za-z0-9_+#.-]*$/
const URL_TRAILING_PUNCTUATION = '.,!?:;*_~'
const URL_TERMINATORS = new Set(['<', '>', '"', '`'])
const WORD_CHAR = /[\p{L}\p{N}]/u
const URL_HOST_START = /[\p{L}\p{N}]/u

function isSpace(ch: string): boolean {
    return /\s/.test(ch)
}

function trimUrl(url: string): string {
    let end = url.length
    const count = { '(': 0, ')': 0, '[': 0, ']': 0 }
    for (let i = 0; i < url.length; i++) {
        const ch = url[i]
        if (ch in count) count[ch as keyof typeof count]++
    }
    while (end > 0) {
        const last = url[end - 1]
        if (URL_TRAILING_PUNCTUATION.includes(last)) {
            end--
        } else if (last === ')' && count[')'] > count['(']) {
            count[')']--
            end--
        } else if (last === ']' && count[']'] > count['[']) {
            count[']']--
            end--
        } else {
            break
        }
    }
    return url.slice(0, end)
}

function readUrl(s: string, start: number): string | null {
    const schemeEnd = s.indexOf('://', start) + 3
    if (!URL_HOST_START.test(s.charAt(schemeEnd))) return null
    let end = schemeEnd
    while (end < s.length && !isSpace(s[end]) && !URL_TERMINATORS.has(s[end])) end++
    const url = trimUrl(s.slice(start, end))
    return url.length > schemeEnd - start ? url : null
}

function mergeText(tokens: InlineToken[]): InlineToken[] {
    const merged: InlineToken[] = []
    for (const token of tokens) {
        const prev = merged[merged.length - 1]
        if (token.type === 'text') {
            if (token.value === '') continue
            if (prev?.type === 'text') {
                merged[merged.length - 1] = { type: 'text', value: prev.value + token.value }
                continue
            }
        }
        merged.push(token)
    }
    return merged
}

function finalize(tokens: InlineToken[]): InlineToken[] {
    return mergeText(tokens).map((token) =>
        token.type === 'bold' || token.type === 'italic' || token.type === 'strike'
            ? { ...token, children: finalize(token.children) }
            : token,
    )
}

const FORMAT_FOR_MARKER: Record<string, 'bold' | 'italic' | 'strike'> = {
    '**': 'bold',
    '*': 'italic',
    '_': 'italic',
    '~~': 'strike',
}

interface Opener {
    marker: string
    index: number
}

/**
 * Single left-to-right pass over a flat output list plus a bounded opener
 * stack: each character is visited once, and a closer only ever searches the
 * (at most MAX_NESTING deep) stack, so cost stays linear on adversarial input.
 * An opener that never finds its closer stays in the list as literal text.
 */
function parseInline(s: string): InlineToken[] {
    const out: InlineToken[] = []
    const stack: Opener[] = []
    let textStart = 0
    let i = 0

    const flush = (end: number) => {
        if (end > textStart) out.push({ type: 'text', value: s.slice(textStart, end) })
    }

    const emitMarker = (marker: string, canOpen: boolean, canClose: boolean) => {
        if (canClose) {
            for (let k = stack.length - 1; k >= 0; k--) {
                if (stack[k].marker !== marker) continue
                const opener = stack[k]
                if (out.length - 1 === opener.index) break
                const children = out.splice(opener.index)
                children.shift()
                stack.length = k
                out.push({ type: FORMAT_FOR_MARKER[marker], children })
                return
            }
        }
        if (canOpen && stack.length < MAX_NESTING) {
            stack.push({ marker, index: out.length })
        }
        out.push({ type: 'text', value: marker })
    }

    const emitRun = (ch: '*' | '~', runLength: number, canOpen: boolean, canClose: boolean) => {
        const pairs = Math.floor(runLength / 2)
        const single = runLength % 2 === 1
        const emitSingle = () => {
            if (ch === '*') emitMarker('*', canOpen, canClose)
            else out.push({ type: 'text', value: '~' })
        }
        if (canClose && single) emitSingle()
        for (let n = 0; n < pairs; n++) emitMarker(ch + ch, canOpen, canClose)
        if (!canClose && single) emitSingle()
    }

    while (i < s.length) {
        const ch = s[i]

        if (ch === '`') {
            if (s[i + 1] === '`') {
                while (i < s.length && s[i] === '`') i++
                continue
            }
            let j = i + 1
            while (j < s.length && s[j] !== '`' && s[j] !== '\n') j++
            if (j < s.length && s[j] === '`' && s[j + 1] !== '`') {
                flush(i)
                out.push({ type: 'code', value: s.slice(i + 1, j) })
                i = j + 1
                textStart = i
                continue
            }
            i++
            continue
        }

        if ((ch === 'h' || ch === 'H') && URL_START.test(s.slice(i, i + 8))) {
            const prev = i > 0 ? s[i - 1] : ''
            if (!WORD_CHAR.test(prev)) {
                const url = readUrl(s, i)
                if (url) {
                    flush(i)
                    out.push({ type: 'link', href: url })
                    i += url.length
                    textStart = i
                    continue
                }
            }
            i++
            continue
        }

        if (ch === '*' || ch === '_' || ch === '~') {
            let end = i + 1
            while (end < s.length && s[end] === ch) end++
            const prev = i > 0 ? s[i - 1] : ''
            const next = end < s.length ? s[end] : ''
            const spaceBefore = prev === '' || isSpace(prev)
            const spaceAfter = next === '' || isSpace(next)
            let canOpen = !spaceAfter
            let canClose = !spaceBefore
            if (ch === '_') {
                canOpen = canOpen && !WORD_CHAR.test(prev)
                canClose = canClose && !WORD_CHAR.test(next)
            }
            if ((ch === '~' && end - i < 2) || (ch === '_' && end - i > 1)) {
                i = end
                continue
            }
            if (canOpen || canClose) {
                flush(i)
                if (ch === '_') emitMarker('_', canOpen, canClose)
                else emitRun(ch, end - i, canOpen, canClose)
                textStart = end
            }
            i = end
            continue
        }

        i++
    }
    flush(s.length)
    return finalize(out)
}

/**
 * Block pass: splits into fenced code blocks, `> ` quotes and inline runs.
 * The newline that separates a block from its neighbours is consumed; every
 * other newline stays in the text so the renderer's pre-wrap keeps it.
 */
export function formatMessage(content: string): MessageToken[] {
    if (content === '') return []
    const lines = content.split('\n')
    const tokens: MessageToken[] = []
    let run: string[] = []
    let fencesPossible = true

    const flushRun = () => {
        if (run.length === 0) return
        const text = run.join('\n')
        run = []
        if (text !== '') for (const token of parseInline(text)) tokens.push(token)
    }

    let i = 0
    while (i < lines.length) {
        const line = lines[i]

        if (fencesPossible && FENCE_OPEN.test(line.trimEnd())) {
            let close = -1
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].trimEnd() === '```') {
                    close = j
                    break
                }
            }
            if (close === -1) {
                fencesPossible = false
            } else {
                flushRun()
                tokens.push({ type: 'codeBlock', value: lines.slice(i + 1, close).join('\n') })
                i = close + 1
                continue
            }
        }

        if (line.startsWith('> ')) {
            flushRun()
            const quoted: string[] = []
            while (i < lines.length && lines[i].startsWith('> ')) {
                quoted.push(lines[i].slice(2))
                i++
            }
            tokens.push({ type: 'quote', children: parseInline(quoted.join('\n')) })
            continue
        }

        run.push(line)
        i++
    }
    flushRun()
    return tokens
}
