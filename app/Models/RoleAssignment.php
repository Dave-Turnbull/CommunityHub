<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RoleAssignment extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['role_id', 'user_id', 'assigned_at'];

    protected function casts(): array
    {
        return ['assigned_at' => 'datetime'];
    }

    public function role(): BelongsTo { return $this->belongsTo(Role::class); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}
