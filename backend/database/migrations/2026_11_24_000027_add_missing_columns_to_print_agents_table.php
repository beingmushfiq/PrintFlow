<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('print_agents', function (Blueprint $table) {
            if (! Schema::hasColumn('print_agents', 'device_uuid')) {
                $table->string('device_uuid', 255)->nullable();
            }
            if (! Schema::hasColumn('print_agents', 'agent_token_hash')) {
                $table->string('agent_token_hash', 255)->nullable();
            }
            if (! Schema::hasColumn('print_agents', 'pairing_code_expires_at')) {
                $table->timestamp('pairing_code_expires_at')->nullable();
            }
            if (! Schema::hasColumn('print_agents', 'metadata')) {
                $table->json('metadata')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('print_agents', function (Blueprint $table) {
            if (Schema::hasColumn('print_agents', 'device_uuid')) {
                $table->dropColumn('device_uuid');
            }
            if (Schema::hasColumn('print_agents', 'agent_token_hash')) {
                $table->dropColumn('agent_token_hash');
            }
            if (Schema::hasColumn('print_agents', 'pairing_code_expires_at')) {
                $table->dropColumn('pairing_code_expires_at');
            }
            if (Schema::hasColumn('print_agents', 'metadata')) {
                $table->dropColumn('metadata');
            }
        });
    }
};
