<?php

// The one user-facing upload size limit — UploadController validates against
// this. nginx's client_max_body_size and php.ini's upload_max_filesize/
// post_max_size (docker/nginx/default.conf, docker/app/php.ini) are hard
// ceilings set comfortably above this value; they exist so a raw request
// over the limit gets a clean 413 handled at the edge rather than PHP ever
// seeing it, not to be the tunable value themselves. Raise this — not those —
// to allow larger uploads, and keep the ceilings above it (or reaching the
// new limit will 413 before Laravel's own validation ever runs).
return [
    'max_size_kb' => (int) env('UPLOAD_MAX_SIZE_KB', 102400), // 100 MB

    // Extensions Laravel's `mimes:` rule accepts (checked against the real
    // fileinfo-detected content type, not just the filename). Deliberately
    // excludes svg/html/htm — AttachmentController serves files with
    // Content-Disposition: inline, so an SVG or HTML attachment would render
    // as a same-origin page, not just download, making it a stored-XSS
    // vector rather than an upload-hygiene nitpick. Don't add either back
    // without also changing how attachments are served.
    'allowed_mimes' => explode(',', env(
        'UPLOAD_ALLOWED_MIMES',
        'jpeg,png,gif,webp,mp4,webm,mov,mp3,wav,ogg,pdf,txt,zip'
    )),
];
