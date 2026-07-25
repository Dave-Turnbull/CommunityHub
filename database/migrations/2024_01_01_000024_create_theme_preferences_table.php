<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row per user. `overrides` holds only the variables the user has
        // tweaked away from `preset`'s own values — see
        // App\Support\Theme\ThemeTokens and docs/theming.md. No row for a
        // user means "use the 'classic' preset, no overrides" (the CSS
        // defaults already baked into app.css cover that case for free).
        Schema::create('theme_preferences', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->string('preset')->default('classic');
            $table->json('overrides')->nullable();
            $table->timestamps();

            $table->unique('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('theme_preferences');
    }
};
