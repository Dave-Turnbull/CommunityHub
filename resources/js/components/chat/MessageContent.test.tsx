import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MessageContent } from '@/components/chat/MessageContent'

const renderContent = (content: string) => render(<div data-testid="root"><MessageContent content={content} /></div>)

describe('MessageContent', () => {
    it('renders plain text unchanged, newlines included', () => {
        renderContent('hello\nworld')
        expect(screen.getByTestId('root').textContent).toBe('hello\nworld')
        expect(screen.getByTestId('root').children).toHaveLength(0)
    })

    it('renders an http(s) url as a safe new-tab anchor', () => {
        renderContent('go to https://example.com/a?b=1.')
        const a = screen.getByRole('link')
        expect(a).toHaveAttribute('href', 'https://example.com/a?b=1')
        expect(a).toHaveAttribute('target', '_blank')
        expect(a).toHaveAttribute('rel', 'noopener noreferrer')
        expect(a).toHaveTextContent('https://example.com/a?b=1')
        expect(screen.getByTestId('root').textContent).toBe('go to https://example.com/a?b=1.')
    })

    it.each(['javascript:alert(1)', 'data:text/html,hi', 'mailto:a@b.c', 'ftp://x.example/f', '//example.com'])(
        'renders %s without an anchor',
        (src) => {
            renderContent(src)
            expect(screen.queryByRole('link')).toBeNull()
            expect(screen.getByTestId('root').textContent).toBe(src)
        },
    )

    it('renders script tags as inert text', () => {
        const { container } = renderContent('<script>alert(1)</script><img src=x onerror=alert(1)>')
        expect(container.querySelector('script')).toBeNull()
        expect(container.querySelector('img')).toBeNull()
        expect(screen.getByTestId('root').textContent).toBe('<script>alert(1)</script><img src=x onerror=alert(1)>')
    })

    it('renders bold, italic and strikethrough', () => {
        const { container } = renderContent('**b** *i* _j_ ~~s~~')
        expect(container.querySelector('strong')).toHaveTextContent('b')
        expect(Array.from(container.querySelectorAll('em')).map((e) => e.textContent)).toEqual(['i', 'j'])
        expect(container.querySelector('del')).toHaveTextContent('s')
    })

    it('renders a link inside bold', () => {
        const { container } = renderContent('**see https://a.com/x**')
        const a = container.querySelector('strong a')
        expect(a).toHaveAttribute('href', 'https://a.com/x')
    })

    it('renders inline code literally', () => {
        const { container } = renderContent('run `**x** https://a.com` now')
        expect(container.querySelector('code')).toHaveTextContent('**x** https://a.com')
        expect(container.querySelector('strong')).toBeNull()
        expect(screen.queryByRole('link')).toBeNull()
    })

    it('renders a fenced block as pre > code with literal contents', () => {
        const { container } = renderContent('before\n```js\nconst a = **1**\n  https://a.com\n```\nafter')
        const pre = container.querySelector('pre')!
        expect(pre.querySelector('code')!.textContent).toBe('const a = **1**\n  https://a.com')
        expect(pre.textContent).not.toContain('js')
        expect(screen.queryByRole('link')).toBeNull()
        expect(screen.getByTestId('root').textContent).toBe('beforeconst a = **1**\n  https://a.comafter')
    })

    it('renders an unclosed fence as plain text', () => {
        const { container } = renderContent('```\nnot code')
        expect(container.querySelector('pre')).toBeNull()
        expect(screen.getByTestId('root').textContent).toBe('```\nnot code')
    })

    it('renders a quote with inline formatting inside', () => {
        const { container } = renderContent('> **quoted** https://a.com\nreply')
        const quote = container.querySelector('blockquote')!
        expect(quote.querySelector('strong')).toHaveTextContent('quoted')
        expect(quote.querySelector('a')).toHaveAttribute('href', 'https://a.com')
        expect(quote.textContent).not.toContain('>')
        expect(screen.getByTestId('root').textContent).toBe('quoted https://a.comreply')
    })

    it('renders nothing for empty content', () => {
        renderContent('')
        expect(screen.getByTestId('root').textContent).toBe('')
    })
})
