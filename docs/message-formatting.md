# Message formatting

Message, comment and forum-post bodies render clickable links and a small fixed set of
inline formatting. It is render-only: the stored and sent text is always the raw source
string, the edit box shows and saves that source, and nothing on the backend knows about it.

## Pieces

- `resources/js/services/messageFormat.ts` — `formatMessage(content)`, a pure tokenizer
  returning a `MessageToken[]`. No DOM, no dependencies.
- `resources/js/components/chat/MessageContent.tsx` — maps tokens to React elements. Used
  for `MessageRow`'s body, `CommentThread`'s comment body (not the `[deleted]` tombstone),
  and `ForumChannelContent`'s post detail body.

Compact previews stay plain text: the line-clamped post-list preview in
`ForumChannelContent` and `ReplyPreviewContent` render `content` as a raw string, because
block elements (code blocks, quotes) do not belong inside a clamp.

The containers around `MessageContent` are `<div>`s, not `<p>`s (a `<pre>`/`<blockquote>`
inside a `<p>` is invalid HTML), and keep `whitespace-pre-wrap break-words` so newlines
render as they did before formatting existed.

## Syntax

| Syntax | Result |
|---|---|
| `http://…` / `https://…` bare URL | `<a target="_blank" rel="noopener noreferrer">`; the URL itself is the link text |
| `` ```⏎ … ⏎``` `` (fence lines on their own) | `<pre><code>`, contents literal; an optional language word after the opening fence is dropped |
| `` `code` `` | `<code>`, contents literal |
| `**bold**` | `<strong>` |
| `*italic*`, `_italic_` | `<em>` |
| `~~strike~~` | `<del>` |
| line starting `> ` | `<blockquote>`; consecutive quote lines form one quote; inline formatting applies inside |

Emphasis may nest (`***both***`, `**bold *and italic***`) and may contain links and inline
code. There are no headings, lists, tables, images, `[text](url)` links or HTML; `<`/`>` are
ordinary text.

### Rules for the ambiguous cases

- **Schemes.** Only `http`/`https` (case-insensitive) are ever linked, and only when not
  preceded by a letter/digit and followed by a letter/digit host. `javascript:`, `data:`,
  `mailto:`, `ftp:`, `//host` and `www.` stay text.
- **URL extent.** A URL runs to whitespace or one of `<` `>` `"` `` ` ``. Trailing
  `.` `,` `!` `?` `:` `;` and the emphasis characters `*` `_` `~` are trimmed (the latter so
  `**https://a.com**` closes the bold), as is a `)` or `]` with no matching opener inside the
  URL; a balanced pair (`…/Foo_(bar)`) is kept.
- **Underscores.** `_` opens only when not preceded by a letter/digit and closes only when not
  followed by one, so `snake_case_names` is untouched. URLs are consumed before delimiters, so
  underscores inside them never italicise. A run of two or more underscores is literal.
  `*` and `~~` may be intraword (`a*b*c`).
- **Flanking.** A marker opens only if the next character is not whitespace and closes only if
  the previous one is not; `2 * 3 * 4` is untouched. Empty emphasis (`****`) and unmatched
  markers render literally. A single `~` is literal.
- **Inline code** is a single backtick pair on one line; runs of two or more backticks, an
  empty pair or an unterminated backtick are literal text.
- **Fences.** The opener line is ` ``` ` plus an optional language word; the closer is a line
  that is exactly ` ``` `. An unclosed fence renders as plain text (formatting still applies
  to it as ordinary text). Fence markers elsewhere in a line are not fences.
- **Quotes.** The `> ` prefix needs the space; `>x` and mid-line `>` are text. The newline
  adjoining a block (fence or quote) is consumed; every other newline stays in the text.
- **Nesting** is capped at 8 open emphasis levels; an opener beyond that is literal.

## Safety model

- Text only reaches the DOM as React text nodes; there is no `dangerouslySetInnerHTML` and no
  HTML parsing. `<script>` is displayed, not executed.
- The only attribute built from user text is `href`, and the tokenizer only produces a `link`
  token for strings that begin `http://` or `https://`.
- Tokenizing is linear: a single left-to-right pass with a flat output list and an opener
  stack bounded at 8, no backtracking regexes, and a fence scan that is abandoned for the rest
  of the message once one opener has no closer. `messageFormat.test.ts` formats ~50 KB of
  adversarial input (`*`, `_`, backticks, fences, repeated schemes, trailing punctuation) and
  asserts it completes quickly.

## Styling

Theme tokens only: links `text-text-link hover:text-text-link-hover hover:underline
break-all`; inline code and code blocks `bg-third rounded` with Tailwind's stock `font-mono`
(the theme exposes no monospace family variable of its own); block code scrolls horizontally
(`overflow-x-auto whitespace-pre`); quotes `border-l-4 border-sixth pl-3 text-text-secondary`.

## Extending

Add a token type to `messageFormat.ts`, handle it in `MessageContent.tsx`, and add a tokenizer
test for the positive case and each negative case. Keep new syntax linear-time and covered by
the hostile-input test.
