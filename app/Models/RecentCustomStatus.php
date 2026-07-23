<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Collection;

class RecentCustomStatus extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['user_id', 'text', 'color'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Ordered by updated_at, with id (a time-ordered UUIDv7 — see CLAUDE.md
     * trap #14) as a tiebreaker, since multiple statuses recorded within the
     * same second would otherwise sort arbitrarily on updated_at alone.
     *
     * @return Collection<int, self>
     */
    public static function recentForUser(string $userId, int $limit = 3): Collection
    {
        return static::where('user_id', $userId)
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->limit($limit)
            ->get(['text', 'color']);
    }
}
