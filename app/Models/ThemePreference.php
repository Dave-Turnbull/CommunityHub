<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ThemePreference extends Model
{
    use HasFactory, HasUuids;

    public const DEFAULT_PRESET = 'classic';

    protected $fillable = ['user_id', 'preset', 'overrides'];

    protected function casts(): array
    {
        return ['overrides' => 'array'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
