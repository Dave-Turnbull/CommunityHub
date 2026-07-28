<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Message;
use App\Services\VoteService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VoteController extends Controller
{
    public function store(Request $request, Message $message): JsonResponse
    {
        $validated = $request->validate([
            'value' => ['required', 'integer', 'in:1,-1'],
        ]);

        $summary = VoteService::for($message)->cast($request->user(), $validated['value']);

        return response()->json($summary);
    }

    public function destroy(Request $request, Message $message): JsonResponse
    {
        $summary = VoteService::for($message)->remove($request->user());

        return response()->json($summary);
    }
}
