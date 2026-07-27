<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Attachment extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'message_id', 'path', 'uploader_id', 'filename', 'mime_type', 'size_bytes', 'width', 'height',
    ];

    // `path` is the disk-relative location on the private `local` disk — an
    // implementation detail, never sent to the client. `url` isn't a column
    // at all; it's always derived (below) from the gated route, so it can
    // never drift out of sync with wherever that route lives.
    protected $hidden = ['path'];
    protected $appends = ['url'];

    protected function casts(): array
    {
        return [
            'size_bytes' => 'integer',
            'width'      => 'integer',
            'height'     => 'integer',
        ];
    }

    protected function url(): Attribute
    {
        return Attribute::get(fn () => route('attachments.show', ['attachment' => $this->id]));
    }

    public function message(): BelongsTo { return $this->belongsTo(Message::class); }
}
