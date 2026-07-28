<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Vote extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['message_id', 'user_id', 'value'];

    protected function casts(): array
    {
        return ['value' => 'integer'];
    }

    public function message(): BelongsTo { return $this->belongsTo(Message::class); }
    public function user(): BelongsTo    { return $this->belongsTo(User::class); }
}
