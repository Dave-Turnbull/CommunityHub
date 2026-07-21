<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attachment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class UploadController extends Controller
{
    /**
     * Simple direct upload through the app.
     * Swap this for presigned R2 URLs when you're ready for production scale.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'max:8192'],   // 8 MB
        ]);

        $file = $request->file('file');
        $path = $file->store('uploads', 'public');

        // Read image dimensions so the frontend can reserve layout space
        [$width, $height] = str_starts_with($file->getMimeType(), 'image/')
            ? (getimagesize($file->getRealPath()) ?: [null, null])
            : [null, null];

        $attachment = Attachment::create([
            'url'        => Storage::disk('public')->url($path),
            'filename'   => $file->getClientOriginalName(),
            'mime_type'  => $file->getMimeType(),
            'size_bytes' => $file->getSize(),
            'width'      => $width,
            'height'     => $height,
        ]);

        return response()->json($attachment, 201);
    }
}
