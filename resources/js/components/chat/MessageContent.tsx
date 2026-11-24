import { Fragment, useMemo, type ReactNode } from 'react'
import { formatMessage, type InlineToken, type MessageToken } from '@/services/messageFormat'

function renderInline(tokens: InlineToken[]): ReactNode {
    return tokens.map((token, i) => {
        switch (token.type) {
            case 'text':
                return <Fragment key={i}>{token.value}</Fragment>
            case 'link':
                return (
                    <a
                        key={i}
                        href={token.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-text-link hover:text-text-link-hover hover:underline break-all"
                    >
                        {token.href}
                    </a>
                )
            case 'code':
                return (
                    <code key={i} className="bg-third rounded px-1 font-mono">
                        {token.value}
                    </code>
                )
            case 'bold':
                return <strong key={i} className="font-semibold">{renderInline(token.children)}</strong>
            case 'italic':
                return <em key={i}>{renderInline(token.children)}</em>
            case 'strike':
                return <del key={i}>{renderInline(token.children)}</del>
        }
    })
}

function renderBlock(token: MessageToken, key: number): ReactNode {
    switch (token.type) {
        case 'codeBlock':
            return (
                <pre key={key} className="bg-third rounded p-2 my-1 overflow-x-auto whitespace-pre font-mono">
                    <code>{token.value}</code>
                </pre>
            )
        case 'quote':
            return (
                <blockquote key={key} className="border-l-4 border-sixth pl-3 my-1 text-text-secondary">
                    {renderInline(token.children)}
                </blockquote>
            )
        default:
            return <Fragment key={key}>{renderInline([token])}</Fragment>
    }
}

export function MessageContent({ content }: { content: string }) {
    const tokens = useMemo(() => formatMessage(content), [content])
    return <>{tokens.map(renderBlock)}</>
}
