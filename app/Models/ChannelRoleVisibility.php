<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ChannelRoleVisibility extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'channel_role_visibility';

    protected $fillable = ['channel_id', 'role_id'];

    public function channel(): BelongsTo { return $this->belongsTo(Channel::class); }
    public function role(): BelongsTo    { return $this->belongsTo(Role::class); }
}
