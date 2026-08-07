<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Attachment;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AttachmentController extends Controller
{
    /**
     * The one place an attachment's bytes are ever served from — never a
     * direct storage URL (see UploadController, CLAUDE.md's "Attachment
     * visibility"). Authorized via AttachmentPolicy, which defers to
     * MessagePolicy once the attachment is on a sent message, so this is
     * exactly as accessible as the message itself.
     */
    public function show(Attachment $attachment): StreamedResponse
    {
        Gate::authorize('view', $attachment);

        // `path` is nullable only for rows that predate this column (their
        // file lived on the old public disk at a path this schema has no
        // record of) — genuinely gone, not a bug, so a plain 404.
        abort_if(is_null($attachment->path), 404);

        // Defense in depth on top of UploadController's mime allow-list — a
        // browser must not MIME-sniff an inline-served attachment into
        // executing as HTML/script even if a mislabeled file ever slips
        // through. StreamedResponse has no fluent ->header() helper like a
        // normal Response, so set it directly on the headers bag.
        $response = Storage::disk('local')->response($attachment->path, $attachment->filename);
        $response->headers->set('X-Content-Type-Options', 'nosniff');

        return $response;
    }
}
