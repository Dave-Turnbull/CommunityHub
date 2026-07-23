<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VoiceDevicePreference extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['user_id', 'client_id', 'input_device_id', 'output_device_id', 'send_threshold'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public static function forClient(string $userId, string $clientId): ?self
    {
        return static::where('user_id', $userId)->where('client_id', $clientId)->first();
    }
}
