<?php

namespace App\Support\ChannelTypes;

/**
 * Composes the text and vote Features — no new primitive of its own (see
 * docs/architecture-vision.md's "a forum is not a new primitive"). Comments
 * themselves need no capability entry: whether a channel allows them is the
 * comments_enabled parameter in defaultSettings(), not a text.* grant — see
 * docs/comments-and-voting.md.
 */
class ForumChannelType implements ChannelType
{
    public function key(): string { return 'forum'; }
    public function label(): string { return 'Forums'; }
    public function icon(): string { return '📋'; }
    public function order(): int { return 3; }
    public function capabilities(): array { return ['text.all', 'vote.all']; }

    public function defaultSettings(): array
    {
        return [
            'comments_enabled'         => true,
            'cascade_delete_comments'  => false,
            'max_comment_depth'        => null,
            'default_sort'             => 'new',
        ];
    }

    public function category(): string { return 'forum'; }
    public function description(): string { return 'Threaded posts with comments and voting.'; }
}
