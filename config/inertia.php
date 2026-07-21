<?php

return [

    'ssr' => [
        'enabled'              => false,
        'url'                  => env('INERTIA_SSR_URL', 'http://127.0.0.1:13714'),
        'ensure_bundle_exists' => false,
    ],

    // Pages live in resources/js/pages (lowercase) in this project, not the
    // package default resources/js/Pages — override both spots or
    // assertInertia()->component(...) fails to find real pages in tests.
    'ensure_pages_exist' => false,

    'page_paths' => [
        resource_path('js/pages'),
    ],

    'page_extensions' => [
        'tsx',
    ],

    'use_script_element_for_initial_page' => false,

    'testing' => [
        'ensure_pages_exist' => true,

        'page_paths' => [
            resource_path('js/pages'),
        ],

        'page_extensions' => [
            'tsx',
        ],
    ],

    'history' => [
        'encrypt' => false,
    ],

];
