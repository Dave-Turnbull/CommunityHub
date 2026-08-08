<?php

namespace App\Models;

use App\Support\Permission;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ChannelPermissionOverride extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['channel_id', 'role_id', 'permission', 'allowed'];

    protected function casts(): array
    {
        return [
            'permission' => Permission::class,
            'allowed'    => 'boolean',
        ];
    }

    public function channel(): BelongsTo { return $this->belongsTo(Channel::class); }
    public function role(): BelongsTo    { return $this->belongsTo(Role::class); }
}
