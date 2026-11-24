<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('printers', function (Blueprint $table) {
            if (! Schema::hasColumn('printers', 'system_name')) {
                $table->string('system_name', 255)->nullable()->after('name');
            }
            if (! Schema::hasColumn('printers', 'is_online')) {
                $table->boolean('is_online')->default(true)->after('is_default');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('printers', function (Blueprint $table) {
            if (Schema::hasColumn('printers', 'system_name')) {
                $table->dropColumn('system_name');
            }
            if (Schema::hasColumn('printers', 'is_online')) {
                $table->dropColumn('is_online');
            }
        });
    }
};
