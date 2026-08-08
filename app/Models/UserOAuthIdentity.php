<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserOAuthIdentity extends Model
{
    use HasFactory, HasUuids;

    // Laravel's pluralizer mangles "OAuth" (splits on the capital-letter
    // run into "o_auth") when deriving a table name from the class name —
    // same trap as CustomEmoji, see CLAUDE.md's trap notes. Explicit table
    // name avoids it.
    protected $table = 'user_oauth_identities';

    protected $fillable = ['user_id', 'provider', 'provider_user_id', 'email'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
