<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Attachment extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'message_id', 'url', 'filename', 'mime_type', 'size_bytes', 'width', 'height',
    ];

    protected function casts(): array
    {
        return [
            'size_bytes' => 'integer',
            'width'      => 'integer',
            'height'     => 'integer',
        ];
    }

    public function message(): BelongsTo { return $this->belongsTo(Message::class); }
}
