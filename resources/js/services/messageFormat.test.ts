import { describe, expect, it } from 'vitest'
import { formatMessage, type MessageToken } from '@/services/messageFormat'

const t = (value: string): MessageToken => ({ type: 'text', value })
const link = (href: string): MessageToken => ({ type: 'link', href })
const code = (value: string): MessageToken => ({ type: 'code', value })
const bold = (...children: any[]): MessageToken => ({ type: 'bold', children })
const italic = (...children: any[]): MessageToken => ({ type: 'italic', children })
const strike = (...children: any[]): MessageToken => ({ type: 'strike', children })

describe('formatMessage plain text', () => {
    it('returns nothing for empty content', () => {
        expect(formatMessage('')).toEqual([])
    })

    it('keeps plain text, including newlines, as one text token', () => {
        expect(formatMessage('hello\nworld\n\nbye')).toEqual([t('hello\nworld\n\nbye')])
    })

    it('treats angle brackets and html as text', () => {
        expect(formatMessage('<script>alert(1)</script> <b>x</b>')).toEqual([
            t('<script>alert(1)</script> <b>x</b>'),
        ])
    })

    it('does not support headings, lists, images or markdown links', () => {
        const src = '[text](nope)\n# head\n- item\n![img](nope)'
        expect(formatMessage(src)).toEqual([t(src)])
    })
})

describe('formatMessage links', () => {
    it('links bare http and https urls', () => {
        expect(formatMessage('see http://a.com and https://b.org/x?y=1#z ok')).toEqual([
            t('see '), link('http://a.com'), t(' and '), link('https://b.org/x?y=1#z'), t(' ok'),
        ])
    })

    it('matches the scheme case-insensitively', () => {
        expect(formatMessage('HTTPS://A.COM')).toEqual([link('HTTPS://A.COM')])
    })

    it.each([
        'javascript:alert(1)',
        'data:text/html,<b>x</b>',
        'mailto:a@b.com',
        'ftp://files.example.com/x',
        '//example.com/path',
        'www.example.com',
        'vbscript:msgbox(1)',
    ])('does not link %s', (src) => {
        expect(formatMessage(src).some((tok) => tok.type === 'link')).toBe(false)
    })

    it('does not link a scheme embedded in a word', () => {
        expect(formatMessage('xhttps://a.com')).toEqual([t('xhttps://a.com')])
    })

    it('does not link a bare scheme with no host', () => {
        expect(formatMessage('https:// nothing')).toEqual([t('https:// nothing')])
        expect(formatMessage('https://.')).toEqual([t('https://.')])
    })

    it.each(['.', ',', '!', '?', ':', ';'])('excludes trailing %s from the link', (p) => {
        expect(formatMessage(`go to https://a.com/x${p}`)).toEqual([t('go to '), link('https://a.com/x'), t(p)])
    })

    it('excludes several trailing punctuation characters', () => {
        expect(formatMessage('https://a.com/x?!.')).toEqual([link('https://a.com/x'), t('?!.')])
    })

    it('excludes an unbalanced closing paren and bracket', () => {
        expect(formatMessage('(see https://a.com/x)')).toEqual([t('(see '), link('https://a.com/x'), t(')')])
        expect(formatMessage('[https://a.com/x]')).toEqual([t('['), link('https://a.com/x'), t(']')])
        expect(formatMessage('(https://a.com/x).')).toEqual([t('('), link('https://a.com/x'), t(').')])
    })

    it('keeps balanced parentheses (wikipedia style)', () => {
        expect(formatMessage('https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual([
            link('https://en.wikipedia.org/wiki/Foo_(bar)'),
        ])
        expect(formatMessage('(https://en.wikipedia.org/wiki/Foo_(bar))')).toEqual([
            t('('), link('https://en.wikipedia.org/wiki/Foo_(bar)'), t(')'),
        ])
    })

    it('ends a link at whitespace and angle brackets', () => {
        expect(formatMessage('https://a.com/x<script>')).toEqual([link('https://a.com/x'), t('<script>')])
        expect(formatMessage('https://a.com\nnext')).toEqual([link('https://a.com'), t('\nnext')])
    })

    it('does not treat underscores inside a url as italic', () => {
        expect(formatMessage('_x_ https://a.com/a_b_c/d_e_f')).toEqual([
            italic(t('x')), t(' '), link('https://a.com/a_b_c/d_e_f'),
        ])
    })

    it('does not link inside inline code or code blocks', () => {
        expect(formatMessage('`https://a.com`')).toEqual([code('https://a.com')])
        expect(formatMessage('```\nhttps://a.com\n```')).toEqual([{ type: 'codeBlock', value: 'https://a.com' }])
    })
})

describe('formatMessage inline code', () => {
    it('renders single backticks literally', () => {
        expect(formatMessage('use `**x** _y_ <b>` now')).toEqual([t('use '), code('**x** _y_ <b>'), t(' now')])
    })

    it('leaves an unmatched backtick as text', () => {
        expect(formatMessage('a ` b')).toEqual([t('a ` b')])
    })

    it('does not span lines', () => {
        expect(formatMessage('`a\nb`')).toEqual([t('`a\nb`')])
    })

    it('leaves empty pairs and multi-backtick runs as text', () => {
        expect(formatMessage('a `` b')).toEqual([t('a `` b')])
        expect(formatMessage('a ``x`` b')).toEqual([t('a ``x`` b')])
    })
})

describe('formatMessage fenced code blocks', () => {
    it('renders a fence on its own lines as a block with literal contents', () => {
        expect(formatMessage('before\n```\n**x** https://a.com\n  indented\n```\nafter')).toEqual([
            t('before'),
            { type: 'codeBlock', value: '**x** https://a.com\n  indented' },
            t('after'),
        ])
    })

    it('drops the language word', () => {
        expect(formatMessage('```ts\nconst a = 1\n```')).toEqual([{ type: 'codeBlock', value: 'const a = 1' }])
    })

    it('supports an empty block', () => {
        expect(formatMessage('```\n```')).toEqual([{ type: 'codeBlock', value: '' }])
    })

    it('renders an unclosed fence as plain text', () => {
        expect(formatMessage('```\n**not bold**')).toEqual([t('```\n'), bold(t('not bold'))])
    })

    it('does not treat a fence that is not on its own line as a block', () => {
        expect(formatMessage('a ```b``` c')).toEqual([t('a ```b``` c')])
    })

    it('does not turn a closing-line with trailing text into a close', () => {
        expect(formatMessage('```\nx\n``` y')).toEqual([t('```\nx\n``` y')])
    })

    it('supports several blocks in one message', () => {
        expect(formatMessage('```\na\n```\n```\nb\n```')).toEqual([
            { type: 'codeBlock', value: 'a' },
            { type: 'codeBlock', value: 'b' },
        ])
    })
})

describe('formatMessage emphasis', () => {
    it('parses bold, italic and strikethrough', () => {
        expect(formatMessage('**b** *i* _j_ ~~s~~')).toEqual([
            bold(t('b')), t(' '), italic(t('i')), t(' '), italic(t('j')), t(' '), strike(t('s')),
        ])
    })

    it('nests formatting', () => {
        expect(formatMessage('**bold *and italic* text**')).toEqual([
            bold(t('bold '), italic(t('and italic')), t(' text')),
        ])
        expect(formatMessage('***both***')).toEqual([bold(italic(t('both')))])
        expect(formatMessage('~~**x**~~')).toEqual([strike(bold(t('x')))])
    })

    it('allows a link inside bold, italic and strikethrough', () => {
        expect(formatMessage('**see https://a.com/x**')).toEqual([bold(t('see '), link('https://a.com/x'))])
        expect(formatMessage('_https://a.com_')).toEqual([italic(link('https://a.com'))])
        expect(formatMessage('~~https://a.com~~')).toEqual([strike(link('https://a.com'))])
    })

    it('allows inline code inside emphasis', () => {
        expect(formatMessage('**run `ls`**')).toEqual([bold(t('run '), code('ls'))])
    })

    it('does not italicise underscores inside words', () => {
        expect(formatMessage('snake_case_names and __init__')).toEqual([t('snake_case_names and __init__')])
        expect(formatMessage('a_b_c')).toEqual([t('a_b_c')])
    })

    it('still italicises asterisks inside words', () => {
        expect(formatMessage('a*b*c')).toEqual([t('a'), italic(t('b')), t('c')])
    })

    it('leaves unmatched markers literal', () => {
        expect(formatMessage('**open only')).toEqual([t('**open only')])
        expect(formatMessage('close only**')).toEqual([t('close only**')])
        expect(formatMessage('a *b')).toEqual([t('a *b')])
        expect(formatMessage('~~x')).toEqual([t('~~x')])
        expect(formatMessage('**a *b** c*')).toEqual([bold(t('a *b')), t(' c*')])
    })

    it('does not format spaced markers such as multiplication', () => {
        expect(formatMessage('2 * 3 * 4 and a _ b _ c')).toEqual([t('2 * 3 * 4 and a _ b _ c')])
    })

    it('leaves a single tilde literal', () => {
        expect(formatMessage('~a~ ~/home')).toEqual([t('~a~ ~/home')])
    })

    it('does not produce empty emphasis', () => {
        expect(formatMessage('****')).toEqual([t('****')])
        expect(formatMessage('a**b')).toEqual([t('a**b')])
    })

    it('does not format inside inline code', () => {
        expect(formatMessage('`**x**` **y**')).toEqual([code('**x**'), t(' '), bold(t('y'))])
    })

    it('formats across a newline', () => {
        expect(formatMessage('**a\nb**')).toEqual([bold(t('a\nb'))])
    })

    it('caps nesting depth and keeps the excess literal', () => {
        const open = '*a '.repeat(20)
        const close = 'a* '.repeat(20)
        const tokens = formatMessage(open + close)
        let depth = 0
        let level: MessageToken[] = tokens
        while (true) {
            const next = level.find((tok) => tok.type === 'italic') as any
            if (!next) break
            depth++
            level = next.children
        }
        expect(depth).toBeLessThanOrEqual(8)
    })
})

describe('formatMessage block quotes', () => {
    it('renders a line starting with "> " as a quote', () => {
        expect(formatMessage('> hello')).toEqual([{ type: 'quote', children: [t('hello')] }])
    })

    it('applies inline formatting inside', () => {
        expect(formatMessage('> **b** https://a.com')).toEqual([
            { type: 'quote', children: [bold(t('b')), t(' '), link('https://a.com')] },
        ])
    })

    it('merges consecutive quote lines and separates surrounding text', () => {
        expect(formatMessage('before\n> one\n> two\nafter')).toEqual([
            t('before'),
            { type: 'quote', children: [t('one\ntwo')] },
            t('after'),
        ])
    })

    it('does not treat a mid-line or space-less ">" as a quote', () => {
        expect(formatMessage('a > b')).toEqual([t('a > b')])
        expect(formatMessage('>nospace')).toEqual([t('>nospace')])
    })

    it('does not quote inside a fenced block', () => {
        expect(formatMessage('```\n> x\n```')).toEqual([{ type: 'codeBlock', value: '> x' }])
    })
})

describe('formatMessage on hostile input', () => {
    const time = (src: string) => {
        const start = performance.now()
        const tokens = formatMessage(src)
        return { ms: performance.now() - start, tokens }
    }

    it('handles a ~50 KB string of markers quickly', () => {
        const unit = '*_`~**__``~~ *a_b* '
        const src = unit.repeat(Math.ceil(50_000 / unit.length))
        expect(src.length).toBeGreaterThanOrEqual(50_000)
        expect(time(src).ms).toBeLessThan(1000)
    })

    it.each([
        ['asterisks', '*'.repeat(50_000)],
        ['underscores', '_'.repeat(50_000)],
        ['backticks', '`'.repeat(50_000)],
        ['alternating', '*a'.repeat(25_000)],
        ['spaced openers', 'a *b '.repeat(10_000)],
        ['fences', '```x\n'.repeat(10_000)],
        ['quotes', '> *\n'.repeat(12_000)],
        ['scheme repeats', 'https://'.repeat(6_000)],
        ['trailing punctuation', 'https://a.com/' + '.'.repeat(50_000)],
        ['trailing parens', 'https://a.com/' + ')'.repeat(50_000)],
        ['mixed delimiters', '*_~`'.repeat(12_500)],
    ])('stays fast on %s', (_name, src) => {
        expect(time(src).ms).toBeLessThan(1000)
    })

    it('never emits a link whose scheme is not http(s)', () => {
        const { tokens } = time('javascript:alert(1) https://ok.com data:x '.repeat(500))
        const hrefs = tokens.filter((tok) => tok.type === 'link').map((tok: any) => tok.href)
        expect(hrefs.length).toBe(500)
        expect(hrefs.every((h: string) => /^https:\/\//.test(h))).toBe(true)
    })
})
