<?php

namespace App\Support\Capabilities;

class VoteFeature implements Feature
{
    public function key(): string { return 'vote'; }

    public function capabilities(): array
    {
        return [
            'cast' => 'Upvote or downvote a message.',
        ];
    }

    public function groups(): array { return []; }
}
