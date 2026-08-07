<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attachment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UploadController extends Controller
{
    /**
     * Stored on the private `local` disk, never the publicly-servable
     * `public` one — an attachment is only reachable through
     * Web\AttachmentController's authorized route (see CLAUDE.md's
     * "Attachment visibility" convention), not a direct file URL.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'file' => [
                'required',
                'file',
                'max:' . config('uploads.max_size_kb'),
                'mimes:' . implode(',', config('uploads.allowed_mimes')),
            ],
        ]);

        $file = $request->file('file');
        $path = $file->store('uploads', 'local');

        // Read image dimensions so the frontend can reserve layout space
        [$width, $height] = str_starts_with($file->getMimeType(), 'image/')
            ? (getimagesize($file->getRealPath()) ?: [null, null])
            : [null, null];

        $attachment = Attachment::create([
            'path'        => $path,
            'uploader_id' => $request->user()->id,
            'filename'    => $file->getClientOriginalName(),
            'mime_type'   => $file->getMimeType(),
            'size_bytes'  => $file->getSize(),
            'width'       => $width,
            'height'      => $height,
        ]);

        return response()->json($attachment, 201);
    }
}
