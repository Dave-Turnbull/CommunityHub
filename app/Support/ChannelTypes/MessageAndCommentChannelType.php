<?php

namespace App\Support\ChannelTypes;

/**
 * An ordinary text channel (Slack-style messaging) where every message also
 * carries an inline "💬 comment" popout — first-level comments only by
 * default (`max_comment_depth: 1`), since a reply-to-a-reply thread doesn't
 * fit the "quick aside on this message" UX this type is for. A room can
 * still raise/clear `max_comment_depth` per channel via `channels.settings`
 * if it wants deeper nesting later — this is a parameter, not a capability,
 * same as `comments_enabled` itself. See docs/comments-and-voting.md.
 */
class MessageAndCommentChannelType implements ChannelType
{
    public function key(): string { return 'message_and_comment'; }
    public function label(): string { return 'Message & Comment'; }
    public function icon(): string { return '💬'; }
    public function order(): int { return 4; }
    public function capabilities(): array { return ['text.all']; }

    public function defaultSettings(): array
    {
        return [
            'comments_enabled'        => true,
            'max_comment_depth'       => 1,
            'cascade_delete_comments' => false,
        ];
    }

    public function category(): string { return 'standard'; }
    public function description(): string { return 'A normal chat where every message can also collect comments.'; }
}
