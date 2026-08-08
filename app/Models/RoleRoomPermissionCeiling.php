<?php

namespace App\Models;

use App\Support\Permission;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RoleRoomPermissionCeiling extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['role_id', 'permission'];

    protected function casts(): array
    {
        return ['permission' => Permission::class];
    }

    public function role(): BelongsTo { return $this->belongsTo(Role::class); }
}
