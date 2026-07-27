<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RoleChannelCategory extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['role_id', 'category'];

    public function role(): BelongsTo { return $this->belongsTo(Role::class); }
}
