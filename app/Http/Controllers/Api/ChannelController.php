<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Channel;
use App\Models\Room;
use App\Support\ChannelTypes\ChannelTypeRegistry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class ChannelController extends Controller
{
    public function store(Request $request, Room $room): JsonResponse
    {
        Gate::authorize('create', [Channel::class, $room]);

        $validated = $request->validate([
            'name'  => ['required', 'string', 'max:100'],
            'type'  => ['required', 'string', Rule::in(ChannelTypeRegistry::registeredTypeKeys())],
            'topic' => ['nullable', 'string', 'max:1024'],
        ]);

        $channelType = ChannelTypeRegistry::for($validated['type']);

        $channel = Channel::create([
            'room_id'  => $room->id,
            'name'     => $validated['name'],
            'type'     => $validated['type'],
            'topic'    => $validated['topic'] ?? null,
            'position' => (int) $room->channels()->max('position') + 1,
            'settings' => $channelType?->defaultSettings() ?? [],
        ]);

        return response()->json($channel, 201);
    }

    public function update(Request $request, Channel $channel): JsonResponse
    {
        Gate::authorize('manage', $channel);

        $validated = $request->validate([
            'name'              => ['sometimes', 'string', 'max:100'],
            'topic'             => ['sometimes', 'nullable', 'string', 'max:1024'],
            'is_nsfw'           => ['sometimes', 'boolean'],
            'slow_mode_seconds' => ['sometimes', 'integer', 'min:0', 'max:21600'],
        ]);

        $channel->update($validated);

        return response()->json($channel);
    }

    public function destroy(Request $request, Channel $channel): JsonResponse
    {
        Gate::authorize('manage', $channel);

        $channel->delete();

        return response()->json(['deleted' => true]);
    }

    public function reorder(Request $request, Room $room): JsonResponse
    {
        Gate::authorize('create', [Channel::class, $room]);

        $validated = $request->validate([
            'channel_ids'   => ['required', 'array'],
            'channel_ids.*' => ['uuid', Rule::exists('channels', 'id')->where('room_id', $room->id)],
        ]);

        foreach (array_values($validated['channel_ids']) as $position => $channelId) {
            Channel::where('id', $channelId)->update(['position' => $position]);
        }

        return response()->json(['reordered' => true]);
    }
}
