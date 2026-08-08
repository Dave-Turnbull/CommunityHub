<?php

namespace App\Models;

use App\Support\Permission;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RoomPermissionCeiling extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['room_id', 'permission'];

    protected function casts(): array
    {
        return ['permission' => Permission::class];
    }

    public function room(): BelongsTo { return $this->belongsTo(Room::class); }
}
